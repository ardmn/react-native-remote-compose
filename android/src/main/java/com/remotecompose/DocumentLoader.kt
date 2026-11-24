package com.remotecompose

import android.annotation.SuppressLint
import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.util.Base64
import android.webkit.URLUtil
import com.facebook.react.modules.network.OkHttpClientProvider
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response

/** Turns a [DocumentSource] into `.rc` bytes. Cancelling the caller cancels the read. */
internal object DocumentLoader {
    /** Larger documents are refused as soon as the limit is passed, not after reading them. */
    const val MAX_DOCUMENT_BYTES = 16 * 1024 * 1024
    private const val TIMEOUT_SECONDS = 15L

    /** Schemes Android's [ContentResolver] opens. */
    private val CONTENT_RESOLVER_SCHEMES =
        setOf(ContentResolver.SCHEME_FILE, ContentResolver.SCHEME_CONTENT, ContentResolver.SCHEME_ANDROID_RESOURCE)

    /**
     * React Native's shared client, so the app's network setup (its `OkHttpClientFactory`: proxies,
     * certificate pinning, interceptors) applies to documents as it does to `fetch`.
     */
    private val httpClient: OkHttpClient by lazy {
        OkHttpClientProvider.getOkHttpClient()
            .newBuilder()
            .callTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .build()
    }

    suspend fun load(context: Context, source: DocumentSource): ByteArray = when (source) {
        is DocumentSource.Base64 -> Base64.decode(source.encoded, Base64.DEFAULT)
        is DocumentSource.Json -> runInterruptible(Dispatchers.Default) { JsonDocuments.toRc(source.json) }
        is DocumentSource.Uri -> loadUri(context, source)
    }

    private suspend fun loadUri(context: Context, source: DocumentSource.Uri): ByteArray {
        // UseKtx: toUri() is core-ktx, which this library does not declare. Declaring it would put a
        // minimum core-ktx version on every app for a one-line wrapper around Uri.parse.
        @SuppressLint("UseKtx")
        val uri = Uri.parse(source.uri)
        return when {
            URLUtil.isNetworkUrl(source.uri) -> loadHttp(source)

            uri.scheme in CONTENT_RESOLVER_SCHEMES -> runInterruptible(Dispatchers.IO) {
                context.contentResolver.openInputStream(uri)?.use { it.readAtMost(MAX_DOCUMENT_BYTES) }
                    ?: throw IOException("Cannot open ${source.uri}")
            }

            // Release builds hand bundled assets over as a bare resource name (res/raw).
            uri.scheme == null -> runInterruptible(Dispatchers.IO) { loadRawResource(context, source.uri) }

            else -> throw IllegalArgumentException("Unsupported uri scheme: ${source.uri}")
        }
    }

    private suspend fun loadHttp(source: DocumentSource.Uri): ByteArray {
        val request =
            Request.Builder()
                .url(source.uri)
                // A few header strings copied once per request: the copy the rule warns about is negligible.
                .headers(@Suppress("SpreadOperator") Headers.headersOf(*source.headers.toTypedArray()))
                .build()
        val call = httpClient.newCall(request)
        return suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(
                object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        continuation.resumeWith(Result.failure(e))
                    }

                    override fun onResponse(call: Call, response: Response) {
                        continuation.resumeWith(runCatching { response.use { readBody(it, source.uri) } })
                    }
                }
            )
        }
    }

    // One throw per way a response can fail, each with its own message for onError.
    @Suppress("ThrowsCount")
    private fun readBody(response: Response, uri: String): ByteArray {
        if (!response.isSuccessful) throw IOException("HTTP ${response.code} for $uri")
        val body = response.body ?: throw IOException("Empty response for $uri")
        if (body.contentLength() > MAX_DOCUMENT_BYTES) throw DocumentTooLargeException(MAX_DOCUMENT_BYTES)
        return body.byteStream().readAtMost(MAX_DOCUMENT_BYTES)
    }

    /**
     * React Native's own release asset lookup (`ResourceDrawableIdHelper`) resolves bundled files by
     * name the same way; raw resources have no compile-time id for a name that arrives at runtime.
     */
    private fun loadRawResource(context: Context, name: String): ByteArray {
        @Suppress("DiscouragedApi")
        val id = context.resources.getIdentifier(name, "raw", context.packageName)
        if (id == 0) throw IOException("No bundled asset named $name")
        return context.resources.openRawResource(id).use { it.readAtMost(MAX_DOCUMENT_BYTES) }
    }
}

internal class DocumentTooLargeException(limit: Int) : IOException("Document larger than $limit bytes")

/** Reads the stream to the end, failing as soon as it passes [limit] bytes. */
internal fun InputStream.readAtMost(limit: Int): ByteArray {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    while (true) {
        val count = read(buffer)
        if (count < 0) return output.toByteArray()
        if (output.size() + count > limit) throw DocumentTooLargeException(limit)
        output.write(buffer, 0, count)
    }
}

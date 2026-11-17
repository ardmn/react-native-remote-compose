package com.remotecompose

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.compose.remote.creation.json.RemoteComposeJsonParser
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Where a document comes from, as the view's props describe it. Exactly one is non-null. */
internal data class DocumentRequest(
  val base64: String?,
  val uri: String?,
  val headers: List<String>,
  val json: String?,
) {
  val isEmpty: Boolean
    get() = base64.isNullOrEmpty() && uri.isNullOrEmpty() && json.isNullOrEmpty()
}

/** Turns a [DocumentRequest] into `.rc` bytes. Blocking: call from a background dispatcher. */
internal object DocumentLoader {
  private const val TIMEOUT_MS = 15_000
  private const val MAX_BYTES = 16 * 1024 * 1024

  fun load(context: Context, request: DocumentRequest): ByteArray =
    when {
      !request.base64.isNullOrEmpty() -> Base64.decode(request.base64, Base64.DEFAULT)
      !request.json.isNullOrEmpty() -> convertJson(request.json)
      !request.uri.isNullOrEmpty() -> loadUri(context, request.uri, request.headers)
      else -> throw IllegalArgumentException("No document source")
    }

  /** AndroidX authoring JSON → `.rc`, with AndroidX's own parser. */
  fun convertJson(json: String): ByteArray {
    val buffer = RemoteComposeJsonParser.parseToByteBuffer(json)
    return ByteArray(buffer.remaining()).also { buffer.get(it) }
  }

  private fun loadUri(context: Context, uri: String, headers: List<String>): ByteArray {
    val parsed = Uri.parse(uri)
    return when (parsed.scheme?.lowercase()) {
      "http", "https" -> loadHttp(uri, headers)
      "file", "content", "android.resource" ->
        context.contentResolver.openInputStream(parsed)?.use { it.readBounded() }
          ?: throw IOException("Cannot open $uri")
      // Release builds hand bundled assets over as a bare resource name (res/raw).
      null -> loadRawResource(context, uri)
      else -> throw IllegalArgumentException("Unsupported uri scheme: $uri")
    }
  }

  private fun loadHttp(uri: String, headers: List<String>): ByteArray {
    val connection = URL(uri).openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = TIMEOUT_MS
      connection.readTimeout = TIMEOUT_MS
      headers.chunked(2).forEach { pair ->
        if (pair.size == 2) connection.setRequestProperty(pair[0], pair[1])
      }
      val code = connection.responseCode
      if (code !in 200..299) throw IOException("HTTP $code for $uri")
      return connection.inputStream.use { it.readBounded() }
    } finally {
      connection.disconnect()
    }
  }

  private fun loadRawResource(context: Context, name: String): ByteArray {
    val id = context.resources.getIdentifier(name, "raw", context.packageName)
    if (id == 0) throw IOException("No bundled asset named $name")
    return context.resources.openRawResource(id).use { it.readBounded() }
  }

  private fun java.io.InputStream.readBounded(): ByteArray {
    val bytes = readBytes()
    if (bytes.size > MAX_BYTES) throw IOException("Document larger than $MAX_BYTES bytes")
    return bytes
  }
}

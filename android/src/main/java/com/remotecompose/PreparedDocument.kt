package com.remotecompose

import android.content.Context
import android.os.SystemClock
import com.remotecompose.contract.ErrorCode
import com.remotecompose.contract.LoadEvent
import ee.schimke.composeai.rcplayer.compose.RcTypefaceLoader
import ee.schimke.composeai.rcplayer.compose.composeSupportReport
import ee.schimke.composeai.rcplayer.protocol.RcDocument
import ee.schimke.composeai.rcplayer.protocol.RcDocumentCodec
import ee.schimke.composeai.rcplayer.runtime.RcDocumentCapabilities
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** A document that decoded and passed the player's support check, ready to show. Immutable. */
internal class PreparedDocument(
    val document: RcDocument,
    val capabilities: RcDocumentCapabilities,
    private val byteLength: Int,
    private val loadNanos: Long,
    private val decodeNanos: Long
) {
    fun loadEvent(): LoadEvent = LoadEvent(
        byteLength = byteLength,
        loadMs = loadNanos / NANOS_PER_MILLI,
        decodeMs = decodeNanos / NANOS_PER_MILLI,
        namedValues = capabilities.namedValues.keys.map(UserDomain::unqualify).sorted()
    )

    private companion object {
        const val NANOS_PER_MILLI = 1_000_000.0
    }
}

/** A failure reported to JS with the [code] the spec gives it. */
internal class RemoteComposeException(val code: ErrorCode, message: String, cause: Throwable? = null) :
    Exception(message, cause)

/**
 * Loads, decodes and validates [source] off the main thread. Touches no view state, so the caller
 * decides on which thread the result is used. Throws [RemoteComposeException]; cancellation is
 * propagated unchanged.
 */
internal suspend fun prepareDocument(
    context: Context,
    source: DocumentSource,
    lenient: Boolean,
    typefaces: RcTypefaceLoader
): PreparedDocument {
    val loadStart = SystemClock.elapsedRealtimeNanos()
    val bytes = stage(ErrorCode.LOAD) { DocumentLoader.load(context, source) }
    val decodeStart = SystemClock.elapsedRealtimeNanos()
    val (document, capabilities) =
        stage(ErrorCode.DOCUMENT) {
            withContext(Dispatchers.Default) {
                val document = RcDocumentCodec.decode(bytes)
                document.composeSupportReport(availableFontFamilies = typefaces.families).requireRenderable(lenient)
                document to RcDocumentCapabilities.of(document)
            }
        }
    val end = SystemClock.elapsedRealtimeNanos()
    return PreparedDocument(document, capabilities, bytes.size, decodeStart - loadStart, end - decodeStart)
}

private suspend fun <T> stage(code: ErrorCode, block: suspend () -> T): T = try {
    block()
} catch (e: CancellationException) {
    throw e
} catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
    // Every failure of a stage, whatever AndroidX or rc-players throws, reaches JS as that stage's code.
    throw RemoteComposeException(code, e.message ?: e.toString(), e)
}

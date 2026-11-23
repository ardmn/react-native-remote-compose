package com.remotecompose

import androidx.compose.remote.creation.json.RemoteComposeJsonParser
import ee.schimke.composeai.rcplayer.protocol.RcDocumentCodec
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable

/** AndroidX authoring JSON → `.rc`, with AndroidX's own parser. Blocking and CPU-bound. */
internal object JsonDocuments {
    /**
     * The parser declares host values with bare names; they are moved into the [UserDomain] every
     * player addresses (the same step tools/remote-compose-json applies), so a document converted
     * here is byte-identical to one converted at build time.
     *
     * `RemoteComposeJsonParser` is `@RestrictTo(LIBRARY_GROUP)` in AndroidX: no public API turns
     * authoring JSON into a document, and a restricted API can change in any release without
     * notice. Accepted knowingly. The guard is the CI step "Demo documents are up to date with
     * their JSON" (.github/workflows/ci.yml): it reconverts the demo documents with the pinned
     * version and fails if a committed `.rc` changes. It covers only the demo documents, not every
     * JSON an app sends. After reviewing a change, regenerate them with `yarn documents`.
     */
    // Kotlin @Suppress rather than @SuppressLint: tools/remote-compose-json compiles this file on
    // the plain JVM. Android Lint honours both.
    @Suppress("RestrictedApi")
    fun toRc(json: String): ByteArray {
        val buffer = RemoteComposeJsonParser.parseToByteBuffer(json)
        val document = RcDocumentCodec.decode(ByteArray(buffer.remaining()).also { buffer.get(it) })
        val operations =
            document.operations.map { operation ->
                if (operation is RcNamedVariable) {
                    operation.copy(
                        name = UserDomain.qualify(operation.name)
                    )
                } else {
                    operation
                }
            }
        return RcDocumentCodec.encode(document.copy(operations = operations))
    }
}

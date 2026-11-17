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
     */
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

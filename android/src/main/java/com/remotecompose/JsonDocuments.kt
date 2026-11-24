package com.remotecompose

import androidx.compose.remote.creation.json.RemoteComposeJsonParser
import ee.schimke.composeai.rcplayer.protocol.RcDocumentCodec
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable

/** AndroidX authoring JSON → `.rc`, with AndroidX's own parser. Blocking and CPU-bound. */
internal object JsonDocuments {
    /**
     * The parser declares host values with bare names; they are moved into the [UserDomain] every
     * player addresses (the same step tools/remote-compose-json applies, from this same file).
     *
     * `RemoteComposeJsonParser` is `@RestrictTo(LIBRARY_GROUP)` in AndroidX: no public API turns
     * authoring JSON into a document, and a restricted API can change in any release without
     * notice. Accepted knowingly. What CI checks (step "Demo documents are up to date with their
     * JSON" in .github/workflows/ci.yml): the CLI's conversion of the demo JSON files, with the
     * version in android/gradle/libs.versions.toml, equals the committed `.rc` files. After
     * reviewing a change, regenerate them with `yarn documents`. It does not cover every JSON an
     * app sends, and on-device output can differ from the CLI's for the same JSON when:
     * - the app overrides `androidxRemoteVersion` (or resolves a newer remote-creation-core), so
     *   another parser runs;
     * - the source is `{ json: object }`: JS serialises it with `JSON.stringify`, which writes
     *   integer-like keys ("2", "10") first in ascending order, so declaration order (and ids) can
     *   differ from the key order of the JSON text the CLI reads.
     *
     * `@Suppress` rather than `@SuppressLint`: tools/remote-compose-json compiles this file on the
     * plain JVM. Android Lint honours both.
     */
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

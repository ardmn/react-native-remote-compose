package com.remotecompose.tools

import androidx.compose.remote.creation.json.RemoteComposeJsonParser
import ee.schimke.composeai.rcplayer.compose.composeSupportReport
import ee.schimke.composeai.rcplayer.edit.toStructuralText
import ee.schimke.composeai.rcplayer.protocol.RcDocument
import ee.schimke.composeai.rcplayer.protocol.RcDocumentCodec
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable
import java.io.File
import kotlin.system.exitProcess

/**
 * AndroidX Remote Compose authoring JSON → `.rc`, for servers and build steps (iOS has no
 * on-device converter).
 *
 *   remote-compose-json in.json out.rc        convert one file
 *   remote-compose-json --dir src/ out/       convert every *.json in src/ to out/<name>.rc
 *   remote-compose-json --dump doc.rc         print a document's structure
 *
 * Every written document is decoded again with rc-players' reader, so a JSON file the player
 * could not read fails the build here rather than on a device.
 */
fun main(args: Array<String>) {
    try {
        when {
            args.size == 2 && args[0] == "--roundtrip" -> {
                val bytes = File(args[1]).readBytes()
                val same = RcDocumentCodec.encode(RcDocumentCodec.decode(bytes)).contentEquals(bytes)
                println(if (same) "roundtrip: identical" else "roundtrip: DIFFERENT")
                if (!same) exitProcess(1)
            }

            args.size == 2 && args[0] == "--dump" -> println(
                RcDocumentCodec.decode(File(args[1]).readBytes()).toStructuralText()
            )

            args.size == 3 && args[0] == "--dir" -> convertDir(File(args[1]), File(args[2]))

            args.size == 2 -> convertFile(File(args[0]), File(args[1]))

            else -> {
                System.err.println("usage: remote-compose-json in.json out.rc | --dir in/ out/ | --dump doc.rc")
                exitProcess(2)
            }
        }
    } catch (e: Exception) {
        System.err.println("error: ${e.message}")
        exitProcess(1)
    }
}

fun convert(json: String): ByteArray {
    val buffer = RemoteComposeJsonParser.parseToByteBuffer(json)
    val bytes = ByteArray(buffer.remaining()).also { buffer.get(it) }
    // Throws if rc-players cannot read what AndroidX wrote.
    val document = RcDocumentCodec.decode(bytes).withUserDomainNames()
    // Throws if rc-players' renderer would refuse it on a device (undeclared ids, unknown operations).
    document.composeSupportReport().requireFullyRenderable()
    return RcDocumentCodec.encode(document)
}

/**
 * AndroidX's JSON parser declares host-settable values with bare names (`accent`), while the
 * Compose capture path and every player address them in the `USER:` domain (`USER:accent`).
 * Players that only accept the `USER:` form (rc-players' iOS controller) could not set them.
 * Moving bare names into `USER:` changes nothing else: ids, types and references stay as written.
 */
fun RcDocument.withUserDomainNames(): RcDocument = copy(
    operations =
        operations.map { op ->
            if (op is RcNamedVariable && ':' !in op.name) op.copy(name = "USER:${op.name}") else op
        }
)

private fun convertFile(input: File, output: File) {
    val bytes =
        try {
            convert(input.readText())
        } catch (e: Exception) {
            throw IllegalArgumentException("${input.path}: ${e.message}", e)
        }
    output.parentFile?.mkdirs()
    output.writeBytes(bytes)
    println("${input.path} -> ${output.path} (${bytes.size} bytes)")
}

private fun convertDir(input: File, output: File) {
    val files = input.listFiles { file -> file.extension == "json" }?.sortedBy { it.name }.orEmpty()
    require(files.isNotEmpty()) { "no *.json in ${input.path}" }
    files.forEach { convertFile(it, File(output, it.nameWithoutExtension + ".rc")) }
}

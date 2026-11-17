package com.remotecompose.tools

import com.remotecompose.JsonDocuments
import ee.schimke.composeai.rcplayer.compose.composeSupportReport
import ee.schimke.composeai.rcplayer.edit.toStructuralText
import ee.schimke.composeai.rcplayer.protocol.RcDocumentCodec
import java.io.File
import kotlin.system.exitProcess

/**
 * AndroidX Remote Compose authoring JSON → `.rc`, for servers and build steps (iOS has no
 * on-device converter).
 *
 *   remote-compose-json in.json out.rc        convert one file
 *   remote-compose-json --dir src/ out/       convert every *.json in src/ to out/<name>.rc
 *   remote-compose-json --dump doc.rc         print a document's structure
 *   remote-compose-json --roundtrip doc.rc    check rc-players re-encodes it byte for byte
 *
 * Conversion is the library's own ([JsonDocuments]); every written document is then checked with
 * rc-players' renderer, so a JSON file the player could not draw fails the build here rather than
 * on a device.
 */
private object Flags {
    const val DIR = "--dir"
    const val DUMP = "--dump"
    const val ROUNDTRIP = "--roundtrip"
}

private const val USAGE =
    "usage: remote-compose-json in.json out.rc | ${Flags.DIR} in/ out/ | ${Flags.DUMP} doc.rc | ${Flags.ROUNDTRIP} doc.rc"
private const val EXIT_FAILURE = 1
private const val EXIT_USAGE = 2
private const val JSON_EXTENSION = "json"
private const val RC_EXTENSION = "rc"

fun main(args: Array<String>) {
    try {
        when {
            args.size == 2 && args[0] == Flags.ROUNDTRIP -> roundtrip(File(args[1]))

            args.size == 2 && args[0] == Flags.DUMP ->
                println(RcDocumentCodec.decode(File(args[1]).readBytes()).toStructuralText())

            args.size == 3 && args[0] == Flags.DIR -> convertDir(File(args[1]), File(args[2]))

            args.size == 2 -> convertFile(File(args[0]), File(args[1]))

            else -> {
                System.err.println(USAGE)
                exitProcess(EXIT_USAGE)
            }
        }
    } catch (e: Exception) {
        System.err.println("error: ${e.message}")
        exitProcess(EXIT_FAILURE)
    }
}

/** JSON → `.rc`; throws if rc-players' renderer would refuse the result on a device. */
fun convert(json: String): ByteArray {
    val bytes = JsonDocuments.toRc(json)
    RcDocumentCodec.decode(bytes).composeSupportReport().requireFullyRenderable()
    return bytes
}

private fun roundtrip(file: File) {
    val bytes = file.readBytes()
    val same = RcDocumentCodec.encode(RcDocumentCodec.decode(bytes)).contentEquals(bytes)
    println(if (same) "roundtrip: identical" else "roundtrip: DIFFERENT")
    if (!same) exitProcess(EXIT_FAILURE)
}

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
    val files = input.listFiles { file -> file.extension == JSON_EXTENSION }?.sortedBy { it.name }.orEmpty()
    require(files.isNotEmpty()) { "no *.$JSON_EXTENSION in ${input.path}" }
    files.forEach { convertFile(it, File(output, "${it.nameWithoutExtension}.$RC_EXTENSION")) }
}

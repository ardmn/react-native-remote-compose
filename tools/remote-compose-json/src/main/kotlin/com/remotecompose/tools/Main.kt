package com.remotecompose.tools

import androidx.compose.remote.creation.json.RemoteComposeJsonParser
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
 *
 * Every written document is decoded again with rc-players' reader, so a JSON file the player
 * could not read fails the build here rather than on a device.
 */
fun main(args: Array<String>) {
  try {
    when {
      args.size == 2 && args[0] == "--dump" -> println(RcDocumentCodec.decode(File(args[1]).readBytes()).toStructuralText())
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
  RcDocumentCodec.decode(bytes) // throws if rc-players cannot read what AndroidX wrote
  return bytes
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
  val files = input.listFiles { file -> file.extension == "json" }?.sortedBy { it.name }.orEmpty()
  require(files.isNotEmpty()) { "no *.json in ${input.path}" }
  files.forEach { convertFile(it, File(output, it.nameWithoutExtension + ".rc")) }
}

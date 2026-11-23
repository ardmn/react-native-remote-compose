package com.remotecompose.tools

import ee.schimke.composeai.rcplayer.protocol.RcDocumentCodec
import ee.schimke.composeai.rcplayer.protocol.RcFloatConstant
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable
import ee.schimke.composeai.rcplayer.protocol.RcTextData
import ee.schimke.composeai.rcplayer.protocol.RcValueFloatChangeAction
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * The converter's contract: JSON in, a document every player can drive out — host values
 * addressable in the USER: domain with the declared type, actions named as written, and a
 * readable error naming the failing node for invalid input.
 */
class ConvertTest {
    private fun declared(json: String): Map<String, Int> = RcDocumentCodec.decode(convert(json)).operations
        .filterIsInstance<RcNamedVariable>()
        .associate { it.name to it.type }

    @Test
    fun `exported values are declared in the USER domain with their type`() {
        val names = declared(
            """
            {"root":{"global":[
              {"resources":{"colors":[{"accent":"#FF6750A4"}],"variables":[{"rating":{"value":0.5,"export":true}}]}},
              {"variable":{"name":"title","vtype":"string","value":"Hi","export":true}},
              {"box":{"modifiers":[{"background":"${'$'}colors.accent"}]}}
            ]}}
            """.trimIndent()
        )
        assertEquals(RcNamedVariable.COLOR_TYPE, names["USER:accent"])
        assertEquals(RcNamedVariable.FLOAT_TYPE, names["USER:rating"])
        assertEquals(RcNamedVariable.STRING_TYPE, names["USER:title"])
        assertTrue(names.keys.none { ':' !in it }, "no bare host names left: $names")
    }

    @Test
    fun `a host action keeps the name the author gave it`() {
        val document = RcDocumentCodec.decode(
            convert(
                """{"root":{"box":{"modifiers":[{"onClick":{"type":"hostAction","name":"add_to_cart"}}]}}}"""
            )
        )
        val texts = document.operations.filterIsInstance<RcTextData>().map { it.text }
        assertTrue("add_to_cart" in texts, "action name in document: $texts")
    }

    @Test
    fun `invalid JSON fails with the path of the failing node`() {
        val error = assertFailsWith<Exception> {
            convert("""{"root":{"column":{"children":[{"nope":{}}]}}}""")
        }
        assertTrue("children" in (error.message ?: ""), "message names the node: ${error.message}")
    }

    @Test
    fun `the bundled demo documents convert`() {
        val dir = java.io.File("../../example-shared/documents/json")
        val files = dir.listFiles { f -> f.extension == "json" }.orEmpty()
        assertTrue(files.isNotEmpty(), "demo documents found in ${dir.absolutePath}")
        files.forEach { assertTrue(convert(it.readText()).isNotEmpty(), it.name) }
    }

    @Test
    fun `the demo documents convert byte-identically to the committed rc files`() {
        // The contract guard for AndroidX's restricted RemoteComposeJsonParser (see JsonDocuments):
        // a remote-creation-core bump that changes what it writes fails here. Review the change,
        // then regenerate with `remote-compose-json --dir example-shared/documents/json
        // example-shared/documents/rc`.
        val json = java.io.File("../../example-shared/documents/json")
        val rc = java.io.File("../../example-shared/documents/rc")
        val files = json.listFiles { f -> f.extension == "json" }.orEmpty()
        assertTrue(files.isNotEmpty(), "demo documents found in ${json.absolutePath}")
        files.forEach { file ->
            val committed = java.io.File(rc, file.nameWithoutExtension + ".rc")
            assertTrue(committed.isFile, "${committed.name} is committed next to ${file.name}")
            assertTrue(
                convert(file.readText()).contentEquals(committed.readBytes()),
                "${file.name} no longer converts to the committed ${committed.name}"
            )
        }
    }

    @Test
    fun `touch actions in the demo documents change a declared number, never a stray text`() {
        val dir = java.io.File("../../example-shared/documents/json")
        dir.listFiles { f -> f.extension == "json" }.orEmpty().forEach { file ->
            val ops = RcDocumentCodec.decode(convert(file.readText())).operations
            val floats = ops.filterIsInstance<RcFloatConstant>().map { it.id }.toSet()
            val texts = ops.filterIsInstance<RcTextData>().map { it.id }.toSet()
            ops.filterIsInstance<RcValueFloatChangeAction>().forEach { action ->
                assertTrue(action.targetValueId in floats, "${file.name}: target ${action.targetValueId} is a float")
                assertTrue(action.targetValueId !in texts, "${file.name}: target ${action.targetValueId} is not text")
            }
        }
    }

    @Test
    fun `a document the player would refuse fails conversion instead of failing on a device`() {
        // A value change whose expression is the bare system clock: AndroidX writes it,
        // rc-players refuses to play it ("Root expression id 1 is not declared").
        val json = """
            {"root":{"global":[
              {"resources":{"variables":[{"t":{"value":0}}]}},
              {"box":{"modifiers":[{"onTouchUp":{"type":"valueFloatExpressionChange","target":"@t","value":"time"}}]}}
            ]}}
        """.trimIndent()
        assertFailsWith<Exception> { convert(json) }
    }
}

package com.remotecompose

import com.remotecompose.contract.NamedValue
import com.remotecompose.contract.NamedValueType
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.COLOR_TYPE
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.FLOAT_TYPE
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.INT_TYPE
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.LONG_TYPE
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.STRING_TYPE
import ee.schimke.composeai.rcplayer.runtime.RcDocumentCapabilities
import ee.schimke.composeai.rcplayer.runtime.RcNamedValue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * How host values from JS reach a document: names resolve as rc-players resolves them, values drive
 * only variables of a compatible type, and anything else is reported, not applied.
 */
class HostValuesTest {
    /** A document that declares [declared] (name → `RcNamedVariable` type constant). */
    private fun document(vararg declared: Pair<String, Int>) = RcDocumentCapabilities(mapOf(*declared), emptySet())

    @Test
    fun `a bare name addresses the variable the document declares in the USER domain`() {
        val result =
            resolveHostValues(listOf(HostValue.FloatValue("rating", 0.5)), document("USER:rating" to FLOAT_TYPE))
        assertEquals(mapOf("rating" to RcNamedValue.FloatValue(0.5f)), result.values)
    }

    @Test
    fun `an explicitly namespaced name addresses exactly that variable`() {
        val result =
            resolveHostValues(
                listOf(HostValue.FloatValue("SYSTEM:x", 1.0)),
                document("SYSTEM:x" to FLOAT_TYPE, "USER:x" to STRING_TYPE)
            )
        assertEquals(mapOf("SYSTEM:x" to RcNamedValue.FloatValue(1f)), result.values)
        assertTrue(result.mismatches.isEmpty())
    }

    @Test
    fun `names the document does not declare are skipped, not errors`() {
        val result =
            resolveHostValues(listOf(HostValue.FloatValue("unknown", 1.0)), document("USER:rating" to FLOAT_TYPE))
        assertTrue(result.values.isEmpty())
        assertTrue(result.mismatches.isEmpty())
    }

    @Test
    fun `a number drives float, integer and long variables`() {
        val declared = document("USER:f" to FLOAT_TYPE, "USER:i" to INT_TYPE, "USER:l" to LONG_TYPE)
        val result =
            resolveHostValues(
                listOf(HostValue.FloatValue("f", 2.5), HostValue.FloatValue("i", 3.0), HostValue.IntValue("l", 7)),
                declared
            )
        assertEquals(RcNamedValue.FloatValue(2.5f), result.values["f"])
        assertEquals(RcNamedValue.Integer(3), result.values["i"])
        assertEquals(RcNamedValue.LongValue(7), result.values["l"])
    }

    @Test
    fun `a boolean drives an integer variable as AndroidX stores it`() {
        val result =
            resolveHostValues(
                listOf(HostValue.BooleanValue("on", true), HostValue.BooleanValue("off", false)),
                document("USER:on" to INT_TYPE, "USER:off" to INT_TYPE)
            )
        assertEquals(RcNamedValue.BooleanValue(true), result.values["on"])
        assertEquals(RcNamedValue.BooleanValue(false), result.values["off"])
    }

    @Test
    fun `a color keeps all four ARGB channels whether JS packed it signed or unsigned`() {
        val argb = 0xFF00897BL
        val fromIos = HostValue.from(NamedValue("a", NamedValueType.COLOR, "", argb.toDouble()))
        val fromAndroid = HostValue.from(NamedValue("b", NamedValueType.COLOR, "", argb.toInt().toDouble()))
        val result = resolveHostValues(
            listOf(fromIos, fromAndroid),
            document(
                "USER:a" to COLOR_TYPE,
                "USER:b" to COLOR_TYPE
            )
        )
        assertEquals(RcNamedValue.Color(argb.toInt()), result.values["a"])
        assertEquals(RcNamedValue.Color(argb.toInt()), result.values["b"])
    }

    @Test
    fun `a value of an incompatible type is reported and not applied`() {
        val incompatible =
            listOf(
                HostValue.FloatValue("title", 1.0),
                HostValue.TextValue("rating", "high"),
                HostValue.BooleanValue("accent", true),
                HostValue.ColorValue("count", 0)
            )
        val result =
            resolveHostValues(
                incompatible,
                document(
                    "USER:title" to STRING_TYPE,
                    "USER:rating" to FLOAT_TYPE,
                    "USER:accent" to COLOR_TYPE,
                    "USER:count" to INT_TYPE
                )
            )
        assertTrue(result.values.isEmpty())
        assertEquals(incompatible, result.mismatches)
    }

    @Test
    fun `every wire type becomes the host value of that type`() {
        val wire = NamedValueType.entries.map { NamedValue("v", it, "text", 1.0) }
        assertEquals(NamedValueType.entries, wire.map { HostValue.from(it).type })
    }
}

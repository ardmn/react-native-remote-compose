package com.remotecompose

import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.COLOR_TYPE
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.FLOAT_TYPE
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.INT_TYPE
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.STRING_TYPE
import ee.schimke.composeai.rcplayer.runtime.RcNamedValue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * How host values from JS reach a document: names resolve as AndroidX's player resolves them,
 * values drive only variables of a compatible type, and anything else is reported, not applied.
 */
class HostValuesTest {
    private fun float(name: String, v: Double) = HostValue(name, "float", "", v)

    @Test
    fun `a bare name addresses the USER domain when the document declares it there`() {
        val result = resolveHostValues(listOf(float("rating", 0.5)), mapOf("USER:rating" to FLOAT_TYPE))
        assertEquals(mapOf("USER:rating" to RcNamedValue.FloatValue(0.5f)), result.values)
    }

    @Test
    fun `a bare name addresses a bare declaration when there is no USER one`() {
        val result = resolveHostValues(listOf(float("rating", 0.5)), mapOf("rating" to FLOAT_TYPE))
        assertEquals(mapOf("rating" to RcNamedValue.FloatValue(0.5f)), result.values)
    }

    @Test
    fun `an explicitly namespaced name is used as written`() {
        val result = resolveHostValues(
            listOf(float("SYSTEM:x", 1.0)),
            mapOf("SYSTEM:x" to FLOAT_TYPE, "USER:SYSTEM:x" to FLOAT_TYPE)
        )
        assertEquals(setOf("SYSTEM:x"), result.values.keys)
    }

    @Test
    fun `names the document does not declare are ignored, not errors`() {
        val result = resolveHostValues(listOf(float("unknown", 1.0)), mapOf("USER:rating" to FLOAT_TYPE))
        assertTrue(result.values.isEmpty())
        assertTrue(result.mismatches.isEmpty())
    }

    @Test
    fun `a JS number drives float and integer variables`() {
        val declared = mapOf("USER:f" to FLOAT_TYPE, "USER:i" to INT_TYPE)
        val result = resolveHostValues(listOf(float("f", 2.5), float("i", 3.0)), declared)
        assertEquals(RcNamedValue.FloatValue(2.5f), result.values["USER:f"])
        assertEquals(RcNamedValue.Integer(3), result.values["USER:i"])
    }

    @Test
    fun `a boolean drives an integer variable as 1 or 0`() {
        val result = resolveHostValues(
            listOf(HostValue("on", "boolean", "", 1.0), HostValue("off", "boolean", "", 0.0)),
            mapOf("USER:on" to INT_TYPE, "USER:off" to INT_TYPE)
        )
        assertEquals(RcNamedValue.BooleanValue(true), result.values["USER:on"])
        assertEquals(RcNamedValue.BooleanValue(false), result.values["USER:off"])
    }

    @Test
    fun `a color keeps all four ARGB channels whether JS sent it signed or unsigned`() {
        val declared = mapOf("USER:a" to COLOR_TYPE, "USER:b" to COLOR_TYPE)
        val unsigned = 0xFF00897BL.toDouble() // processColor on iOS
        val signed = 0xFF00897BL.toInt().toDouble() // processColor on Android
        val result = resolveHostValues(
            listOf(HostValue("a", "color", "", unsigned), HostValue("b", "color", "", signed)),
            declared
        )
        assertEquals(RcNamedValue.Color(0xFF00897BL.toInt()), result.values["USER:a"])
        assertEquals(RcNamedValue.Color(0xFF00897BL.toInt()), result.values["USER:b"])
    }

    @Test
    fun `a value of the wrong type is reported and not applied`() {
        val wrong = HostValue("title", "float", "", 1.0)
        val result = resolveHostValues(listOf(wrong), mapOf("USER:title" to STRING_TYPE))
        assertTrue(result.values.isEmpty())
        assertEquals(listOf(wrong), result.mismatches)
    }
}

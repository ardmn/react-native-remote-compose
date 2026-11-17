package com.remotecompose

import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.JavaOnlyMap
import com.remotecompose.contract.NamedValue
import com.remotecompose.contract.NamedValueType
import com.remotecompose.contract.Theme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Props as JS sends them become the typed values the view works with. */
class PropsTest {
    @Test
    fun `a named value arrives with every field the spec sends`() {
        val wire =
            JavaOnlyArray.of(
                JavaOnlyMap.of(
                    "name",
                    "title",
                    "valueType",
                    NamedValueType.STRING.wireValue,
                    "text",
                    "Hi",
                    "number",
                    0.0
                )
            )
        assertEquals(listOf(NamedValue("title", NamedValueType.STRING, "Hi", 0.0)), NamedValue.listFrom(wire))
    }

    @Test
    fun `a named value without a known type takes the spec's default`() {
        val wire =
            JavaOnlyArray.of(
                JavaOnlyMap.of("name", "a", "text", "", "number", 1.0),
                JavaOnlyMap.of("name", "b", "valueType", "decimal", "text", "", "number", 1.0)
            )
        assertEquals(
            listOf(NamedValueType.DEFAULT, NamedValueType.DEFAULT),
            NamedValue.listFrom(wire).map {
                it.valueType
            }
        )
    }

    @Test
    fun `every theme round-trips and anything else is the default`() {
        Theme.entries.forEach { assertEquals(it, Theme.fromWire(it.wireValue)) }
        assertEquals(Theme.DEFAULT, Theme.fromWire(null))
        assertEquals(Theme.DEFAULT, Theme.fromWire("sepia"))
    }

    @Test
    fun `the document source follows the spec's priority - base64, then JSON, then uri`() {
        val all = RemoteComposeProps(documentBase64 = "AA==", documentJson = "{}", documentUri = "https://x/a.rc")
        assertEquals(DocumentSource.Base64("AA=="), all.source)
        assertEquals(DocumentSource.Json("{}"), all.copy(documentBase64 = null).source)
        assertEquals(
            DocumentSource.Uri("https://x/a.rc", listOf("Authorization", "t")),
            all.copy(documentBase64 = "", documentJson = "", documentHeaders = listOf("Authorization", "t")).source
        )
    }

    @Test
    fun `empty props show no document`() {
        assertNull(RemoteComposeProps().source)
        assertNull(RemoteComposeProps(documentBase64 = "", documentUri = "", documentJson = "").source)
    }
}

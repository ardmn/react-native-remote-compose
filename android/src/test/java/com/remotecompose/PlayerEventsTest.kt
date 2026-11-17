package com.remotecompose

import com.remotecompose.contract.ActionEvent
import com.remotecompose.contract.ActionKind
import com.remotecompose.contract.ActionValueType
import ee.schimke.composeai.rcplayer.runtime.RcHostActionValue
import ee.schimke.composeai.rcplayer.runtime.RcPlayerEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Every host action the player raises reaches JS as one `onRemoteAction` with its typed value. */
class PlayerEventsTest {
    @Test
    fun `a host action carries its id`() {
        assertEquals(
            ActionEvent(kind = ActionKind.HOST, actionId = 7, valueType = ActionValueType.NONE),
            RcPlayerEvent.HostAction(7).toActionEvent()
        )
    }

    @Test
    fun `a metadata action carries its id and metadata`() {
        assertEquals(
            ActionEvent(kind = ActionKind.METADATA, actionId = 3, metadata = "open", valueType = ActionValueType.NONE),
            RcPlayerEvent.HostActionMetadata(3, "open").toActionEvent()
        )
    }

    @Test
    fun `a named action carries its name and its value in the matching field`() {
        fun named(value: RcHostActionValue) = RcPlayerEvent.HostNamedAction("add_to_cart", value).toActionEvent()

        assertEquals(
            ActionEvent(kind = ActionKind.NAMED, name = "add_to_cart", valueType = ActionValueType.NONE),
            named(RcHostActionValue.None)
        )
        assertEquals(
            ActionEvent(kind = ActionKind.NAMED, name = "add_to_cart", valueType = ActionValueType.FLOAT, number = 0.5),
            named(RcHostActionValue.FloatValue(0.5f))
        )
        assertEquals(
            ActionEvent(kind = ActionKind.NAMED, name = "add_to_cart", valueType = ActionValueType.INT, number = 2.0),
            named(RcHostActionValue.IntegerValue(2))
        )
        assertEquals(
            ActionEvent(kind = ActionKind.NAMED, name = "add_to_cart", valueType = ActionValueType.STRING, text = "x"),
            named(RcHostActionValue.TextValue("x"))
        )
        assertEquals(
            ActionEvent(
                kind = ActionKind.NAMED,
                name = "add_to_cart",
                valueType = ActionValueType.FLOAT_LIST,
                numbers = listOf(1.0, 2.5)
            ),
            named(RcHostActionValue.FloatListValue(listOf(1f, 2.5f)))
        )
    }

    @Test
    fun `debug messages are not actions`() {
        assertNull(RcPlayerEvent.DebugMessage("trace", 1f, 0).toActionEvent())
    }
}

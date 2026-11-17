package com.remotecompose

import com.remotecompose.contract.ActionEvent
import com.remotecompose.contract.ActionKind
import com.remotecompose.contract.ActionValueType
import ee.schimke.composeai.rcplayer.runtime.RcHostActionValue
import ee.schimke.composeai.rcplayer.runtime.RcPlayerEvent

/** The `onRemoteAction` event for a player event, or null for events that are not host actions. */
internal fun RcPlayerEvent.toActionEvent(): ActionEvent? = when (this) {
    is RcPlayerEvent.HostAction ->
        ActionEvent(kind = ActionKind.HOST, actionId = actionId, valueType = ActionValueType.NONE)

    is RcPlayerEvent.HostActionMetadata ->
        ActionEvent(
            kind = ActionKind.METADATA,
            actionId = actionId,
            metadata = metadata,
            valueType = ActionValueType.NONE
        )

    is RcPlayerEvent.HostNamedAction -> value.toNamedActionEvent(name)

    is RcPlayerEvent.DebugMessage -> null
}

private fun RcHostActionValue.toNamedActionEvent(name: String): ActionEvent = when (this) {
    RcHostActionValue.None ->
        ActionEvent(kind = ActionKind.NAMED, name = name, valueType = ActionValueType.NONE)

    is RcHostActionValue.FloatValue ->
        ActionEvent(kind = ActionKind.NAMED, name = name, valueType = ActionValueType.FLOAT, number = value.toDouble())

    is RcHostActionValue.IntegerValue ->
        ActionEvent(kind = ActionKind.NAMED, name = name, valueType = ActionValueType.INT, number = value.toDouble())

    is RcHostActionValue.TextValue ->
        ActionEvent(kind = ActionKind.NAMED, name = name, valueType = ActionValueType.STRING, text = value)

    is RcHostActionValue.FloatListValue ->
        ActionEvent(
            kind = ActionKind.NAMED,
            name = name,
            valueType = ActionValueType.FLOAT_LIST,
            numbers = value.map(Float::toDouble)
        )
}

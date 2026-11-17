package com.remotecompose

import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event
import com.remotecompose.contract.ContractEvent

/** One Fabric direct event carrying a [ContractEvent]. */
internal class RemoteComposeEvent(surfaceId: Int, viewId: Int, private val event: ContractEvent) :
    Event<RemoteComposeEvent>(surfaceId, viewId) {
    override fun getEventName(): String = event.eventName

    override fun getEventData(): WritableMap = event.toWritableMap()

    // Each event matters (a tap is not a scroll position): never coalesce.
    override fun canCoalesce(): Boolean = false
}

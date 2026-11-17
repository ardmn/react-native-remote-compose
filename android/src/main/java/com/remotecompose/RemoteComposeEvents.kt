package com.remotecompose

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

/** One Fabric direct event; [name] is the `top*` name registered by the view manager. */
internal class RemoteComposeEvent(
  surfaceId: Int,
  viewId: Int,
  private val name: String,
  private val payload: WritableMap,
) : Event<RemoteComposeEvent>(surfaceId, viewId) {
  override fun getEventName(): String = name

  override fun getEventData(): WritableMap = payload

  // Each event matters (a tap is not a scroll position): never coalesce.
  override fun canCoalesce(): Boolean = false

  companion object {
    const val ACTION = "topRemoteAction"
    const val ERROR = "topRemoteError"
    const val LOAD = "topRemoteLoad"

    fun registrations(): Map<String, Any> =
      mapOf(
        ACTION to mapOf("registrationName" to "onRemoteAction"),
        ERROR to mapOf("registrationName" to "onRemoteError"),
        LOAD to mapOf("registrationName" to "onRemoteLoad"),
      )

    fun error(code: String, message: String): WritableMap =
      Arguments.createMap().apply {
        putString("code", code)
        putString("message", message)
      }
  }
}

package com.remotecompose

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.viewmanagers.RemoteComposeViewManagerDelegate
import com.facebook.react.viewmanagers.RemoteComposeViewManagerInterface

@ReactModule(name = RemoteComposeViewManager.NAME)
class RemoteComposeViewManager :
    SimpleViewManager<RemoteComposeView>(),
    RemoteComposeViewManagerInterface<RemoteComposeView> {
    private val delegate = RemoteComposeViewManagerDelegate(this)

    override fun getDelegate(): ViewManagerDelegate<RemoteComposeView> = delegate

    override fun getName(): String = NAME

    override fun createViewInstance(context: ThemedReactContext): RemoteComposeView = RemoteComposeView(context)

    override fun setDocumentBase64(view: RemoteComposeView, value: String?) = view.setDocumentBase64(value)

    override fun setDocumentUri(view: RemoteComposeView, value: String?) = view.setDocumentUri(value)

    override fun setDocumentHeaders(view: RemoteComposeView, value: ReadableArray?) = view.setDocumentHeaders(value)

    override fun setDocumentJson(view: RemoteComposeView, value: String?) = view.setDocumentJson(value)

    override fun setNamedValues(view: RemoteComposeView, value: ReadableArray?) = view.setNamedValues(value)

    override fun setTheme(view: RemoteComposeView, value: String?) = view.setTheme(value)

    override fun setLenient(view: RemoteComposeView, value: Boolean) = view.setLenient(value)

    override fun onAfterUpdateTransaction(view: RemoteComposeView) {
        super.onAfterUpdateTransaction(view)
        view.commitProps()
    }

    override fun onDropViewInstance(view: RemoteComposeView) {
        view.destroy()
        super.onDropViewInstance(view)
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> = RemoteComposeEvent.registrations()

    companion object {
        const val NAME = "RemoteComposeView"
    }
}

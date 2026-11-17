package com.remotecompose

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.viewmanagers.RemoteComposeViewManagerDelegate
import com.facebook.react.viewmanagers.RemoteComposeViewManagerInterface
import com.remotecompose.contract.DIRECT_EVENT_TYPES
import com.remotecompose.contract.NamedValue
import com.remotecompose.contract.Theme

/** Maps Codegen's props interface to [RemoteComposeView]; wire values become typed here. */
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

    override fun setDocumentHeaders(view: RemoteComposeView, value: ReadableArray?) =
        view.setDocumentHeaders(value?.toArrayList()?.map(Any?::toString).orEmpty())

    override fun setDocumentJson(view: RemoteComposeView, value: String?) = view.setDocumentJson(value)

    override fun setNamedValues(view: RemoteComposeView, value: ReadableArray?) =
        view.setNamedValues(NamedValue.listFrom(value).map(HostValue::from))

    override fun setTheme(view: RemoteComposeView, value: String?) = view.setTheme(Theme.fromWire(value))

    override fun setLenient(view: RemoteComposeView, value: Boolean) = view.setLenient(value)

    override fun onAfterUpdateTransaction(view: RemoteComposeView) {
        super.onAfterUpdateTransaction(view)
        view.commitProps()
    }

    override fun onDropViewInstance(view: RemoteComposeView) {
        view.destroy()
        super.onDropViewInstance(view)
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> = DIRECT_EVENT_TYPES

    companion object {
        const val NAME = "RemoteComposeView"
    }
}

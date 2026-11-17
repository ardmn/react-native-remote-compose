package com.remotecompose

import android.graphics.Color
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.RemoteComposeViewManagerInterface
import com.facebook.react.viewmanagers.RemoteComposeViewManagerDelegate

@ReactModule(name = RemoteComposeViewManager.NAME)
class RemoteComposeViewManager : SimpleViewManager<RemoteComposeView>(),
  RemoteComposeViewManagerInterface<RemoteComposeView> {
  private val mDelegate: ViewManagerDelegate<RemoteComposeView>

  init {
    mDelegate = RemoteComposeViewManagerDelegate(this)
  }

  override fun getDelegate(): ViewManagerDelegate<RemoteComposeView>? {
    return mDelegate
  }

  override fun getName(): String {
    return NAME
  }

  public override fun createViewInstance(context: ThemedReactContext): RemoteComposeView {
    return RemoteComposeView(context)
  }

  @ReactProp(name = "color")
  override fun setColor(view: RemoteComposeView?, color: Int?) {
    view?.setBackgroundColor(color ?: Color.TRANSPARENT)
  }

  companion object {
    const val NAME = "RemoteComposeView"
  }
}

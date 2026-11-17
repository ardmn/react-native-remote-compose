package com.remotecompose

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class RemoteComposeViewPackage : BaseReactPackage() {
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(RemoteComposeViewManager())

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == RemoteComposeModule.NAME) RemoteComposeModule(reactContext) else null

  override fun getReactModuleInfoProvider() =
    ReactModuleInfoProvider {
      mapOf(
        RemoteComposeModule.NAME to
          ReactModuleInfo(
            name = RemoteComposeModule.NAME,
            className = RemoteComposeModule::class.java.name,
            canOverrideExistingModule = false,
            needsEagerInit = false,
            isCxxModule = false,
            isTurboModule = true,
          ),
      )
    }
}

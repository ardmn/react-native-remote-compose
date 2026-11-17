package com.remotecompose

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import java.util.concurrent.Executors

/** JSON → `.rc` with AndroidX's `RemoteComposeJsonParser`, on a background thread. */
@ReactModule(name = RemoteComposeModule.NAME)
class RemoteComposeModule(reactContext: ReactApplicationContext) : NativeRemoteComposeModuleSpec(reactContext) {
    override fun getName(): String = NAME

    override fun isJsonConversionSupported(): Boolean = true

    override fun convertJsonToRc(json: String, promise: Promise) {
        executor.execute {
            try {
                promise.resolve(Base64.encodeToString(DocumentLoader.convertJson(json), Base64.NO_WRAP))
            } catch (e: Exception) {
                promise.reject("E_JSON", e.message ?: e.toString(), e)
            }
        }
    }

    override fun invalidate() {
        executor.shutdown()
        super.invalidate()
    }

    private val executor = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "RemoteComposeJson") }

    companion object {
        const val NAME = "RemoteComposeModule"
    }
}

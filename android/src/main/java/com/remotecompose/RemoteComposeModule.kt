package com.remotecompose

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.remotecompose.contract.ErrorCode
import java.util.concurrent.Executors

/** JSON → `.rc` with AndroidX's `RemoteComposeJsonParser`, on a background thread. */
@ReactModule(name = RemoteComposeModule.NAME)
class RemoteComposeModule(reactContext: ReactApplicationContext) : NativeRemoteComposeModuleSpec(reactContext) {
    private val executor = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, THREAD_NAME) }

    override fun getName(): String = NAME

    override fun isJsonConversionSupported(): Boolean = true

    override fun convertJsonToRc(json: String, promise: Promise) {
        executor.execute {
            try {
                promise.resolve(Base64.encodeToString(JsonDocuments.toRc(json), Base64.NO_WRAP))
            } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
                // Anything AndroidX's parser throws rejects the promise (uncaught on this executor it
                // would crash the app), as a `load` failure, as the view reports it for `{ json }`.
                promise.reject(ErrorCode.LOAD.wireValue, e.message ?: e.toString(), e)
            }
        }
    }

    override fun invalidate() {
        executor.shutdown()
        super.invalidate()
    }

    companion object {
        const val NAME = "RemoteComposeModule"
        private const val THREAD_NAME = "RemoteComposeJson"
    }
}

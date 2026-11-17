package com.remotecompose

import android.os.SystemClock
import android.util.Log
import android.widget.FrameLayout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import ee.schimke.composeai.rcplayer.compose.RcComposePlayer
import ee.schimke.composeai.rcplayer.compose.RcPlayerTheme
import ee.schimke.composeai.rcplayer.compose.RcTypefaceLoader
import ee.schimke.composeai.rcplayer.compose.composeSupportReport
import ee.schimke.composeai.rcplayer.protocol.RcDocument
import ee.schimke.composeai.rcplayer.protocol.RcDocumentCodec
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable
import ee.schimke.composeai.rcplayer.runtime.RcDocumentCapabilities
import ee.schimke.composeai.rcplayer.runtime.RcHostActionValue
import ee.schimke.composeai.rcplayer.runtime.RcNamedValue
import ee.schimke.composeai.rcplayer.runtime.RcPlayerEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * A React Native host view around rc-players' [RcComposePlayer].
 *
 * Props arrive one setter at a time and are applied together in [commitProps] (called from the
 * view manager's `onAfterUpdateTransaction`), so a source change and its named values land in one
 * step. Loading, JSON conversion, decoding and validation run on [Dispatchers.Default]/[Dispatchers.IO];
 * the main thread only swaps the decoded document into Compose state.
 */
class RemoteComposeView(private val reactContext: ThemedReactContext) : FrameLayout(reactContext) {
  private class Loaded(val document: RcDocument, val capabilities: RcDocumentCapabilities)

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var loadJob: Job? = null

  // Pending props, applied in commitProps().
  private var request = DocumentRequest(null, null, emptyList(), null)
  private var requestedValues: List<HostValue> = emptyList()
  private var lenient = false
  private var appliedRequest: DocumentRequest? = null
  private var appliedLenient = false

  // Compose state.
  private var loaded by mutableStateOf<Loaded?>(null)
  private var theme by mutableStateOf(RcPlayerTheme.System)
  private val namedValues = mutableStateMapOf<String, RcNamedValue>()

  private val typefaces: RcTypefaceLoader = RcTypefaceLoader.Default

  private val composeView =
    ComposeView(reactContext).apply {
      setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindow)
      setContent {
        val current = loaded ?: return@setContent
        RcComposePlayer(
          document = current.document,
          modifier = Modifier.fillMaxSize(),
          theme = theme,
          namedValues = namedValues,
          onEvent = ::dispatchPlayerEvent,
          typefaces = typefaces,
        )
      }
    }

  init {
    addView(composeView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  // region props

  fun setDocumentBase64(value: String?) {
    request = request.copy(base64 = value)
  }

  fun setDocumentUri(value: String?) {
    request = request.copy(uri = value)
  }

  fun setDocumentHeaders(value: ReadableArray?) {
    request = request.copy(headers = value?.toArrayList()?.map { it.toString() }.orEmpty())
  }

  fun setDocumentJson(value: String?) {
    request = request.copy(json = value)
  }

  fun setTheme(value: String?) {
    theme =
      when (value) {
        "light" -> RcPlayerTheme.Light
        "dark" -> RcPlayerTheme.Dark
        else -> RcPlayerTheme.System
      }
  }

  fun setLenient(value: Boolean) {
    lenient = value
  }

  fun setNamedValues(value: ReadableArray?) {
    requestedValues = HostValue.parse(value)
  }

  fun commitProps() {
    if (request != appliedRequest || lenient != appliedLenient) {
      appliedRequest = request
      appliedLenient = lenient
      reload(request, lenient)
    } else {
      applyNamedValues()
    }
  }

  // endregion

  private fun reload(request: DocumentRequest, lenient: Boolean) {
    loadJob?.cancel()
    if (request.isEmpty) {
      loaded = null
      return
    }
    val context = reactContext.applicationContext
    loadJob =
      scope.launch {
        val result = runCatching {
          val loadStart = SystemClock.elapsedRealtimeNanos()
          val bytes = withContext(Dispatchers.IO) { DocumentLoader.load(context, request) }
          val decodeStart = SystemClock.elapsedRealtimeNanos()
          val prepared =
            withContext(Dispatchers.Default) {
              try {
                val document = RcDocumentCodec.decode(bytes)
                document
                  .composeSupportReport(availableFontFamilies = typefaces.families)
                  .requireRenderable(lenient)
                Loaded(document, RcDocumentCapabilities.of(document))
              } catch (e: Exception) {
                throw DocumentException(e.message ?: "Document is not playable", e)
              }
            }
          val end = SystemClock.elapsedRealtimeNanos()
          Triple(prepared, bytes.size, (decodeStart - loadStart) to (end - decodeStart))
        }
        result
          .onSuccess { (prepared, size, timings) ->
            namedValues.clear()
            loaded = prepared
            applyNamedValues()
            emit(RemoteComposeEvent.LOAD, loadPayload(prepared, size, timings))
          }
          .onFailure { error ->
            if (error is kotlinx.coroutines.CancellationException) return@onFailure
            Log.w(TAG, "Remote Compose document failed", error)
            loaded = null
            val code = if (error is DocumentException) "document" else "load"
            emit(RemoteComposeEvent.ERROR, RemoteComposeEvent.error(code, error.message ?: error.toString()))
          }
      }
  }

  /**
   * Writes the host values the current document declares with a matching type. The player throws
   * on a declared name written with the wrong type, so mismatches are reported, never applied.
   */
  private fun applyNamedValues() {
    val capabilities = loaded?.capabilities ?: return
    val wanted = HashMap<String, RcNamedValue>()
    for (value in requestedValues) {
      val qualified = if (':' in value.name) value.name else "USER:${value.name}"
      val type = capabilities.namedValueType(value.name) ?: continue
      val converted = value.toRcValue(type)
      if (converted == null) {
        emit(
          RemoteComposeEvent.ERROR,
          RemoteComposeEvent.error("document", "Named value '${value.name}' (${value.type}) does not match the document's type"),
        )
        continue
      }
      wanted[qualified] = converted
    }
    namedValues.keys.retainAll(wanted.keys)
    for ((name, value) in wanted) if (namedValues[name] != value) namedValues[name] = value
  }

  private fun dispatchPlayerEvent(event: RcPlayerEvent) {
    val payload =
      Arguments.createMap().apply {
        putString("kind", "named")
        putInt("actionId", 0)
        putString("name", "")
        putString("metadata", "")
        putString("valueType", "none")
        putString("text", "")
        putDouble("number", 0.0)
        putArray("numbers", Arguments.createArray())
      }
    when (event) {
      is RcPlayerEvent.HostAction -> {
        payload.putString("kind", "host")
        payload.putInt("actionId", event.actionId)
      }
      is RcPlayerEvent.HostActionMetadata -> {
        payload.putString("kind", "metadata")
        payload.putInt("actionId", event.actionId)
        payload.putString("metadata", event.metadata)
      }
      is RcPlayerEvent.HostNamedAction -> {
        payload.putString("name", event.name)
        when (val value = event.value) {
          RcHostActionValue.None -> Unit
          is RcHostActionValue.FloatValue -> {
            payload.putString("valueType", "float")
            payload.putDouble("number", value.value.toDouble())
          }
          is RcHostActionValue.IntegerValue -> {
            payload.putString("valueType", "int")
            payload.putDouble("number", value.value.toDouble())
          }
          is RcHostActionValue.TextValue -> {
            payload.putString("valueType", "string")
            payload.putString("text", value.value)
          }
          is RcHostActionValue.FloatListValue -> {
            payload.putString("valueType", "floatList")
            payload.putArray(
              "numbers",
              Arguments.createArray().apply { value.value.forEach { pushDouble(it.toDouble()) } },
            )
          }
        }
      }
      is RcPlayerEvent.DebugMessage -> {
        Log.d(TAG, "${event.message} ${event.value}")
        return
      }
    }
    emit(RemoteComposeEvent.ACTION, payload)
  }

  private fun loadPayload(prepared: Loaded, size: Int, timings: Pair<Long, Long>): WritableMap =
    Arguments.createMap().apply {
      putInt("byteLength", size)
      putDouble("loadMs", timings.first / 1_000_000.0)
      putDouble("decodeMs", timings.second / 1_000_000.0)
      putArray(
        "namedValues",
        Arguments.createArray().apply {
          prepared.capabilities.namedValues.keys.sorted().forEach { pushString(it.removePrefix("USER:")) }
        },
      )
    }

  private fun emit(name: String, payload: WritableMap) {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
      ?.dispatchEvent(RemoteComposeEvent(surfaceId, id, name, payload))
  }

  // React Native lays children out itself and ignores requestLayout() from views it did not
  // create, so the ComposeView would keep a stale size. Measure and lay it out on request.
  private val measureAndLayout = Runnable {
    measure(
      MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
    )
    layout(left, top, right, bottom)
  }

  override fun requestLayout() {
    super.requestLayout()
    @Suppress("SENSELESS_COMPARISON") // called from the super constructor before init
    if (measureAndLayout != null) post(measureAndLayout)
  }

  fun destroy() {
    scope.cancel()
    composeView.disposeComposition()
  }

  /** One host value from JS, before it is checked against the document's declared type. */
  internal data class HostValue(val name: String, val type: String, val text: String, val number: Double) {
    fun toRcValue(declared: Int): RcNamedValue? =
      when {
        type == "string" && declared == RcNamedVariable.STRING_TYPE -> RcNamedValue.Text(text)
        type == "float" && declared == RcNamedVariable.FLOAT_TYPE -> RcNamedValue.FloatValue(number.toFloat())
        // A JS number is a float by default; let it drive an integer variable too.
        (type == "float" || type == "int") && declared == RcNamedVariable.INT_TYPE ->
          RcNamedValue.Integer(number.toInt())
        type == "int" && declared == RcNamedVariable.FLOAT_TYPE -> RcNamedValue.FloatValue(number.toFloat())
        (type == "float" || type == "int") && declared == RcNamedVariable.LONG_TYPE ->
          RcNamedValue.LongValue(number.toLong())
        type == "boolean" && declared == RcNamedVariable.INT_TYPE -> RcNamedValue.BooleanValue(number != 0.0)
        type == "color" && declared == RcNamedVariable.COLOR_TYPE -> RcNamedValue.Color(number.toLong().toInt())
        else -> null
      }

    companion object {
      fun parse(array: ReadableArray?): List<HostValue> {
        if (array == null) return emptyList()
        return (0 until array.size()).mapNotNull { index ->
          val map = array.getMap(index) ?: return@mapNotNull null
          HostValue(
            name = map.getString("name").orEmpty(),
            type = map.getString("type").orEmpty(),
            text = map.getString("text").orEmpty(),
            number = if (map.hasKey("number")) map.getDouble("number") else 0.0,
          )
        }
      }
    }
  }

  private class DocumentException(message: String, cause: Throwable) : Exception(message, cause)

  private companion object {
    const val TAG = "RemoteComposeView"
  }
}

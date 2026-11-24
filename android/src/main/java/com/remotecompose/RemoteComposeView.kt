package com.remotecompose

import android.annotation.SuppressLint
import android.util.Log
import android.widget.FrameLayout
import androidx.annotation.MainThread
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.remotecompose.contract.ContractEvent
import com.remotecompose.contract.ErrorCode
import com.remotecompose.contract.ErrorEvent
import com.remotecompose.contract.Theme
import ee.schimke.composeai.rcplayer.compose.RcComposePlayer
import ee.schimke.composeai.rcplayer.compose.RcTypefaceLoader
import ee.schimke.composeai.rcplayer.runtime.RcPlayerEvent
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * A React Native host view around rc-players' [RcComposePlayer].
 *
 * **Threading.** React Native calls the prop setters, [commitProps] and [destroy] on the main
 * thread (asserted). Loading runs in [scope], whose dispatcher is the main thread: only the I/O and
 * decoding inside [prepareDocument] leave it, and they touch no view state. All mutable state below
 * is therefore confined to the main thread, and a newer load cancels the older one before it can
 * apply a stale result.
 */
// ViewConstructor: React Native creates it only through RemoteComposeViewManager, with the
// ThemedReactContext it needs; it is never inflated from XML or created by layout tools.
// TooManyFunctions: one setter per React prop (Codegen's interface), the rest is the load lifecycle.
@SuppressLint("ViewConstructor")
@Suppress("TooManyFunctions")
class RemoteComposeView(private val reactContext: ThemedReactContext) : FrameLayout(reactContext) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val typefaces = RcTypefaceLoader.Default
    private val content = PlayerContent(typefaces)

    /** Props as the view manager sets them, one at a time; applied together in [commitProps]. */
    private var pendingProps = RemoteComposeProps()

    /** The props last applied; the shown (or loading) document was requested with them. */
    private var committedProps: RemoteComposeProps? = null

    private var loadJob: Job? = null

    /** Set while a measure-and-layout pass is posted, so a burst of requests posts one. */
    private var layoutPosted = false

    private val composeView =
        ComposeView(reactContext).apply {
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindow)
            setContent { content.Content(onEvent = ::onPlayerEvent) }
        }

    init {
        addView(composeView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    // region props

    internal fun setDocumentBase64(value: String?) = stage { copy(documentBase64 = value) }

    internal fun setDocumentUri(value: String?) = stage { copy(documentUri = value) }

    internal fun setDocumentHeaders(value: List<String>) = stage { copy(documentHeaders = value) }

    internal fun setDocumentJson(value: String?) = stage { copy(documentJson = value) }

    internal fun setNamedValues(value: List<HostValue>) = stage { copy(namedValues = value) }

    internal fun setTheme(value: Theme) = stage { copy(theme = value) }

    internal fun setLenient(value: Boolean) = stage { copy(lenient = value) }

    @MainThread
    private inline fun stage(change: RemoteComposeProps.() -> RemoteComposeProps) {
        UiThreadUtil.assertOnUiThread()
        pendingProps = pendingProps.change()
    }

    @MainThread
    internal fun commitProps() {
        UiThreadUtil.assertOnUiThread()
        val props = pendingProps
        val previous = committedProps
        committedProps = props
        content.setTheme(props.theme)
        if (previous == null || props.source != previous.source || props.lenient != previous.lenient) {
            load(props)
        } else {
            reportMismatches(content.setHostValues(props.namedValues))
        }
    }

    // endregion

    @MainThread
    private fun load(props: RemoteComposeProps) {
        loadJob?.cancel()
        val source = props.source
        if (source == null) {
            content.show(null)
            return
        }
        val context = reactContext.applicationContext
        loadJob =
            scope.launch {
                val prepared =
                    try {
                        prepareDocument(context, source, props.lenient, typefaces)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: RemoteComposeException) {
                        Log.w(TAG, "Remote Compose document failed", e)
                        content.show(null)
                        emit(ErrorEvent(code = e.code, message = e.message.orEmpty()))
                        return@launch
                    }
                content.show(prepared)
                // The latest values: they may have changed while the document loaded.
                reportMismatches(content.setHostValues(committedProps?.namedValues.orEmpty()))
                emit(prepared.loadEvent())
            }
    }

    private fun reportMismatches(mismatches: List<HostValue>) {
        for (value in mismatches) {
            emit(
                ErrorEvent(
                    code = ErrorCode.DOCUMENT,
                    message = "Named value '${value.name}' (${value.type.wireValue}) does not match the document's type"
                )
            )
        }
    }

    private fun onPlayerEvent(event: RcPlayerEvent) {
        if (event is RcPlayerEvent.DebugMessage) Log.d(TAG, "${event.message} ${event.value}")
        event.toActionEvent()?.let(::emit)
    }

    private fun emit(event: ContractEvent) {
        val surfaceId = UIManagerHelper.getSurfaceId(this)
        UIManagerHelper.getEventDispatcher(reactContext)?.dispatchEvent(RemoteComposeEvent(surfaceId, id, event))
    }

    /**
     * React Native lays children out itself and ignores `requestLayout()` from views it did not
     * create, so the ComposeView would keep a stale size: measure and lay it out on request.
     * Called from the superclass constructor, before this class's properties are initialized; the
     * flag is then `false` (its JVM default), which is the right state.
     */
    override fun requestLayout() {
        super.requestLayout()
        if (layoutPosted) return
        layoutPosted = true
        post {
            layoutPosted = false
            measure(
                MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
            )
            layout(left, top, right, bottom)
        }
    }

    @MainThread
    internal fun destroy() {
        UiThreadUtil.assertOnUiThread()
        scope.cancel()
        composeView.disposeComposition()
    }

    private companion object {
        const val TAG = "RemoteComposeView"
    }
}

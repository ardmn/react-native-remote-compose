package com.remotecompose

import androidx.annotation.MainThread
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.remotecompose.contract.Theme
import ee.schimke.composeai.rcplayer.compose.RcComposePlayer
import ee.schimke.composeai.rcplayer.compose.RcPlayerTheme
import ee.schimke.composeai.rcplayer.compose.RcTypefaceLoader
import ee.schimke.composeai.rcplayer.runtime.RcNamedValue
import ee.schimke.composeai.rcplayer.runtime.RcPlayerEvent

/**
 * What the player shows, as Compose state. Written on the main thread only (from the view's
 * commit and load completion), read by composition; the setters are the only way to change it.
 */
@Stable
internal class PlayerContent(private val typefaces: RcTypefaceLoader) {
    private var document by mutableStateOf<PreparedDocument?>(null)
    private var theme by mutableStateOf(RcPlayerTheme.System)
    private val namedValues = mutableStateMapOf<String, RcNamedValue>()

    @MainThread
    fun show(prepared: PreparedDocument?) {
        namedValues.clear()
        document = prepared
    }

    @MainThread
    fun setTheme(value: Theme) {
        theme =
            when (value) {
                Theme.SYSTEM -> RcPlayerTheme.System
                Theme.LIGHT -> RcPlayerTheme.Light
                Theme.DARK -> RcPlayerTheme.Dark
            }
    }

    /**
     * Writes the host values the shown document declares with a compatible type and returns the
     * ones it declares with an incompatible type (the player would throw on those).
     */
    @MainThread
    fun setHostValues(values: List<HostValue>): List<HostValue> {
        val capabilities = document?.capabilities ?: return emptyList()
        val resolution = resolveHostValues(values, capabilities)
        namedValues.keys.retainAll(resolution.values.keys)
        for ((name, value) in resolution.values) {
            if (namedValues[name] != value) namedValues[name] = value
        }
        return resolution.mismatches
    }

    @Composable
    fun Content(onEvent: (RcPlayerEvent) -> Unit) {
        val shown = document ?: return
        RcComposePlayer(
            document = shown.document,
            modifier = Modifier.fillMaxSize(),
            theme = theme,
            namedValues = namedValues,
            onEvent = onEvent,
            typefaces = typefaces
        )
    }
}

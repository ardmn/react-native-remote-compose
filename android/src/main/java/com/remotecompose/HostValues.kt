package com.remotecompose

import com.remotecompose.contract.NamedValue
import com.remotecompose.contract.NamedValueType
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.COLOR_TYPE
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.FLOAT_TYPE
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.INT_TYPE
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.LONG_TYPE
import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable.Companion.STRING_TYPE
import ee.schimke.composeai.rcplayer.runtime.RcDocumentCapabilities
import ee.schimke.composeai.rcplayer.runtime.RcNamedValue

/** A value the host pushes into a document variable, typed as the app gave it in `namedValues`. */
internal sealed interface HostValue {
    val name: String

    /** The type the app gave, as JS names it. */
    val type: NamedValueType

    data class FloatValue(override val name: String, val value: Double) : HostValue {
        override val type get() = NamedValueType.FLOAT
    }

    data class IntValue(override val name: String, val value: Int) : HostValue {
        override val type get() = NamedValueType.INT
    }

    data class BooleanValue(override val name: String, val value: Boolean) : HostValue {
        override val type get() = NamedValueType.BOOLEAN
    }

    data class TextValue(override val name: String, val value: String) : HostValue {
        override val type get() = NamedValueType.STRING
    }

    data class ColorValue(override val name: String, val argb: Int) : HostValue {
        override val type get() = NamedValueType.COLOR
    }

    companion object {
        fun from(wire: NamedValue): HostValue = when (wire.valueType) {
            NamedValueType.FLOAT -> FloatValue(wire.name, wire.number)

            NamedValueType.INT -> IntValue(wire.name, wire.number.toInt())

            NamedValueType.BOOLEAN -> BooleanValue(wire.name, wire.number != 0.0)

            NamedValueType.STRING -> TextValue(wire.name, wire.text)

            // processColor packs ARGB unsigned on iOS and signed on Android; both keep 32 bits.
            NamedValueType.COLOR -> ColorValue(wire.name, wire.number.toLong().toInt())
        }
    }
}

internal data class HostValueResolution(
    /** Values for the player, keyed by the host's name; the player resolves it as it declares it. */
    val values: Map<String, RcNamedValue>,
    /** Values whose variable the document declares with a type the value cannot drive. */
    val mismatches: List<HostValue>
)

/**
 * Matches host values against the variables a document declares. A name is looked up with
 * rc-players' own rule ([RcDocumentCapabilities.namedValueType]), so the wrapper cannot drift from
 * the player. Names the document does not declare are skipped, not errors: one set of host values
 * can serve a family of documents.
 */
internal fun resolveHostValues(requested: List<HostValue>, capabilities: RcDocumentCapabilities): HostValueResolution {
    val values = LinkedHashMap<String, RcNamedValue>()
    val mismatches = ArrayList<HostValue>()
    for (value in requested) {
        val declaredType = capabilities.namedValueType(value.name) ?: continue
        val converted = value.toRcValue(declaredType)
        if (converted == null) mismatches += value else values[value.name] = converted
    }
    return HostValueResolution(values, mismatches)
}

/**
 * The player value for [this] when the document declares its variable with [declaredType] (an
 * `RcNamedVariable` type constant), or null when the value cannot drive that type.
 */
internal fun HostValue.toRcValue(declaredType: Int): RcNamedValue? = when (this) {
    is HostValue.FloatValue -> numeric(value, declaredType)

    is HostValue.IntValue -> numeric(value.toDouble(), declaredType)

    // AndroidX stores a boolean as an integer variable holding 1 or 0.
    is HostValue.BooleanValue -> RcNamedValue.BooleanValue(value).takeIf { declaredType == INT_TYPE }

    is HostValue.TextValue -> RcNamedValue.Text(value).takeIf { declaredType == STRING_TYPE }

    is HostValue.ColorValue -> RcNamedValue.Color(argb).takeIf { declaredType == COLOR_TYPE }
}

/** A number drives any numeric variable: a plain JS number is a double whatever the document wants. */
private fun numeric(value: Double, declaredType: Int): RcNamedValue? = when (declaredType) {
    FLOAT_TYPE -> RcNamedValue.FloatValue(value.toFloat())
    INT_TYPE -> RcNamedValue.Integer(value.toInt())
    LONG_TYPE -> RcNamedValue.LongValue(value.toLong())
    else -> null
}

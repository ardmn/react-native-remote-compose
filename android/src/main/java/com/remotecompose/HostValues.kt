package com.remotecompose

import ee.schimke.composeai.rcplayer.protocol.RcNamedVariable
import ee.schimke.composeai.rcplayer.runtime.RcNamedValue

/** One host value from JS (`namedValues` prop), before it is checked against the document. */
internal data class HostValue(val name: String, val type: String, val text: String, val number: Double)

internal data class HostValueResolution(
    /** Values to hand to the player, keyed by the name the document declares. */
    val values: Map<String, RcNamedValue>,
    /** Values the document declares with a type the host value cannot drive. */
    val mismatches: List<HostValue>
)

/**
 * Matches host values against the names and types a document declares ([declared], from
 * `RcDocumentCapabilities.namedValues`).
 *
 * Name resolution follows AndroidX's player: an explicitly namespaced name (`USER:title`) is used
 * as written; a bare name addresses `USER:name` when the document declares it, otherwise the bare
 * name itself. Names the document does not declare are ignored, so one map of host values can
 * serve a family of documents.
 */
internal fun resolveHostValues(requested: List<HostValue>, declared: Map<String, Int>): HostValueResolution {
    val values = LinkedHashMap<String, RcNamedValue>()
    val mismatches = ArrayList<HostValue>()
    for (value in requested) {
        val name = when {
            ':' in value.name -> value.name
            "USER:${value.name}" in declared -> "USER:${value.name}"
            else -> value.name
        }
        val type = declared[name] ?: continue
        val converted = value.toRcValue(type)
        if (converted == null) mismatches += value else values[name] = converted
    }
    return HostValueResolution(values, mismatches)
}

/** The player value for [this] when the document declares the variable as [declared], else null. */
internal fun HostValue.toRcValue(declared: Int): RcNamedValue? = when {
    type == "string" && declared == RcNamedVariable.STRING_TYPE -> RcNamedValue.Text(text)

    type == "float" && declared == RcNamedVariable.FLOAT_TYPE -> RcNamedValue.FloatValue(number.toFloat())

    type == "int" && declared == RcNamedVariable.FLOAT_TYPE -> RcNamedValue.FloatValue(number.toFloat())

    // A plain JS number arrives as a float; let it drive an integer variable too.
    (type == "float" || type == "int") && declared == RcNamedVariable.INT_TYPE -> RcNamedValue.Integer(number.toInt())

    (type == "float" || type == "int") && declared == RcNamedVariable.LONG_TYPE -> RcNamedValue.LongValue(
        number.toLong()
    )

    type == "boolean" && declared == RcNamedVariable.INT_TYPE -> RcNamedValue.BooleanValue(number != 0.0)

    // processColor gives unsigned ARGB on iOS-style platforms and signed on Android: both fit.
    type == "color" && declared == RcNamedVariable.COLOR_TYPE -> RcNamedValue.Color(number.toLong().toInt())

    else -> null
}

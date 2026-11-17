package com.remotecompose

import com.remotecompose.contract.Theme

/** Where a document comes from. */
internal sealed interface DocumentSource {
    data class Base64(val encoded: String) : DocumentSource

    /** AndroidX authoring JSON, converted on the device. */
    data class Json(val json: String) : DocumentSource

    /** [headers] are flattened as `[name, value, name, value, …]`, as the spec sends them. */
    data class Uri(val uri: String, val headers: List<String>) : DocumentSource
}

/** The view's props, as one immutable value: staged one setter at a time, applied together. */
internal data class RemoteComposeProps(
    val documentBase64: String? = null,
    val documentUri: String? = null,
    val documentHeaders: List<String> = emptyList(),
    val documentJson: String? = null,
    val namedValues: List<HostValue> = emptyList(),
    val theme: Theme = Theme.DEFAULT,
    val lenient: Boolean = false
) {
    /** The document to show, by the spec's priority: base64, then JSON, then uri; null for none. */
    val source: DocumentSource?
        get() = when {
            !documentBase64.isNullOrEmpty() -> DocumentSource.Base64(documentBase64)
            !documentJson.isNullOrEmpty() -> DocumentSource.Json(documentJson)
            !documentUri.isNullOrEmpty() -> DocumentSource.Uri(documentUri, documentHeaders)
            else -> null
        }
}

package com.remotecompose

/**
 * The `USER` domain host-settable variables are declared in (AndroidX's `RemoteState.Domain.User`).
 * Neither AndroidX's creation core nor rc-players exports the constant, so it is defined once here.
 */
internal object UserDomain {
    private const val SEPARATOR = ':'
    private const val PREFIX = "USER$SEPARATOR"

    fun isQualified(name: String): Boolean = SEPARATOR in name

    /** `title` → `USER:title`; a name that already has a domain is left alone. */
    fun qualify(name: String): String = if (isQualified(name)) name else PREFIX + name

    /** `USER:title` → `title`; names in other domains are left alone. */
    fun unqualify(name: String): String = name.removePrefix(PREFIX)
}

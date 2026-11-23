import java.util.Properties

plugins {
    kotlin("jvm") version "2.4.21"
    application
}

kotlin { jvmToolchain(17) }

// One owner for the versions the library ships with: android/versions.properties, which
// android/build.gradle reads too, so the CLI runs the same parser and player as the library's
// defaults. (An app's `androidxRemoteVersion`/`rcPlayersVersion` override does not reach the CLI.)
val sharedVersions =
    Properties().apply {
        file("../../android/versions.properties").inputStream().use { load(it) }
    }

fun sharedVersion(name: String): String =
    sharedVersions.getProperty(name) ?: error("$name is missing from android/versions.properties")

val androidxRemoteVersion = sharedVersion("androidxRemoteVersion")
val rcPlayersVersion = sharedVersion("rcPlayersVersion")

// The library's JSON conversion is plain JVM code: compile the same files here, so the CLI and the
// on-device converter cannot drift apart.
sourceSets.main {
    kotlin.srcDir("../../android/src/main/java")
    kotlin.include(
        "com/remotecompose/JsonDocuments.kt",
        "com/remotecompose/UserDomain.kt",
        "com/remotecompose/tools/**"
    )
}

dependencies {
    // AndroidX's own authoring-JSON parser; on the JVM it needs org.json, which Android bundles.
    implementation("androidx.compose.remote:remote-creation-core:$androidxRemoteVersion")
    // Android's org.json, not org.json:json: the parser walks JSONObject.keys() to assign ids, and
    // only Android's keeps insertion order (org.json:json is a HashMap), so ids follow the JSON text
    // as they do on a device. open-json is AOSP's libcore JSON code, Apache-2.0.
    // Accepted risk: its last release is 1.8 (January 2017) and it gets no fixes. It runs only in
    // this dev CLI, on JSON we author, and is not shipped in the npm package or the apps (Android
    // bundles its own org.json). OSV-Scanner in CI does not cover it: it scans yarn.lock and
    // example/Gemfile.lock, not this build's Gradle dependencies.
    implementation("com.tdunning:json:1.8")
    // rc-players' reader: validates what the parser wrote and prints it (--dump).
    implementation("ee.schimke.composeai:rc-player-edit:$rcPlayersVersion")
    // rc-players' renderer support check: the same gate the Android/iOS views run before playing.
    implementation("ee.schimke.composeai:rc-player-compose:$rcPlayersVersion")
    testImplementation(kotlin("test"))
}

application {
    mainClass.set("com.remotecompose.tools.MainKt")
    applicationName = "remote-compose-json"
}

tasks.test {
    useJUnitPlatform()
    // The tests read the demo documents: a changed document must re-run them, never hit the cache.
    inputs.dir("../../example-shared/documents/json").withPathSensitivity(PathSensitivity.RELATIVE)
}

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
    implementation("org.json:json:20260814")
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

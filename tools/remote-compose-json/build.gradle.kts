plugins {
    kotlin("jvm") version "2.4.21"
    application
}

kotlin { jvmToolchain(17) }

// One owner for the AndroidX version: the library's android/build.gradle, so the CLI and its
// contract test always run the parser the library ships.
val androidxRemoteVersion: String =
    Regex("""androidxRemoteVersion: "([^"]+)"""")
        .find(file("../../android/build.gradle").readText())
        ?.groupValues?.get(1)
        ?: error("androidxRemoteVersion not found in android/build.gradle")

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
    implementation("ee.schimke.composeai:rc-player-edit:3.8.0")
    // rc-players' renderer support check: the same gate the Android/iOS views run before playing.
    implementation("ee.schimke.composeai:rc-player-compose:3.8.0")
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
    // ...and so must a changed committed `.rc`, which the byte-identity contract test compares to.
    inputs.dir("../../example-shared/documents/rc").withPathSensitivity(PathSensitivity.RELATIVE)
}

plugins {
    kotlin("jvm") version "2.4.21"
    application
}

kotlin { jvmToolchain(17) }

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
    implementation(libs.remote.creation.core)
    // Android's org.json, not org.json:json: the parser walks JSONObject.keys() to assign ids, and
    // only Android's keeps insertion order (org.json:json is a HashMap), so ids follow the JSON text
    // as they do on a device. open-json is AOSP's libcore JSON code, Apache-2.0.
    // Accepted risk: its last release is 1.8 (January 2017) and it gets no fixes. It runs only in
    // this dev CLI, on JSON we author, and is not shipped in the npm package or the apps (Android
    // bundles its own org.json). OSV-Scanner in CI scans it through gradle.lockfile (below).
    implementation("com.tdunning:json:1.8")
    // rc-players' reader: validates what the parser wrote and prints it (--dump).
    implementation(libs.rc.player.edit)
    // rc-players' renderer support check: the same gate the Android/iOS views run before playing.
    implementation(libs.rc.player.compose)
    testImplementation(kotlin("test"))
}

// Lock what the CLI runs with in gradle.lockfile, so OSV-Scanner (CI's supply-chain job) scans these
// dependencies too. A changed dependency fails the build until the lock is rewritten, and CI fails
// when the lock does not match the declared dependencies. Test and build-tool configurations are not
// locked. After changing a dependency (android/gradle/libs.versions.toml included):
//   tools/remote-compose-json/gradlew -p tools/remote-compose-json dependencies --write-locks
configurations.named("runtimeClasspath") { resolutionStrategy.activateDependencyLocking() }

application {
    mainClass.set("com.remotecompose.tools.MainKt")
    applicationName = "remote-compose-json"
}

tasks.test {
    useJUnitPlatform()
    // The tests read the demo documents: a changed document must re-run them, never hit the cache.
    inputs.dir("../../example-shared/documents/json").withPathSensitivity(PathSensitivity.RELATIVE)
}

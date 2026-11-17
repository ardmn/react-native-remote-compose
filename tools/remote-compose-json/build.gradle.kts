plugins {
    kotlin("jvm") version "2.4.21"
    application
}

kotlin { jvmToolchain(17) }

dependencies {
    // AndroidX's own authoring-JSON parser; on the JVM it needs org.json, which Android bundles.
    implementation("androidx.compose.remote:remote-creation-core:1.0.0-alpha23")
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
}

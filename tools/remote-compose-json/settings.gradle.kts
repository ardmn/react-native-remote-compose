rootProject.name = "remote-compose-json"

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
    // The library's catalog: the CLI runs the same parser and player versions the library ships
    // with by default. (An app's `androidxRemoteVersion`/`rcPlayersVersion` override does not
    // reach the CLI.)
    versionCatalogs { create("libs") { from(files("../../android/gradle/libs.versions.toml")) } }
}

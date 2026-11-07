plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.orangeplayer.poc"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.orangeplayer.poc"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
}

val copyWebAssets by tasks.registering(Copy::class) {
    dependsOn("webBuild")
    from("../../apps/web/dist")
    into("src/main/assets/web")
}

tasks.register<Exec>("webBuild") {
    workingDir("../../apps/web")
    commandLine("cmd", "/c", "npm run build")
}
tasks.named("preBuild").configure { dependsOn(copyWebAssets) }

dependencies {
    implementation("androidx.media3:media3-exoplayer:1.11.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.11.1")
    implementation("androidx.media3:media3-ui:1.11.1")
    implementation("androidx.webkit:webkit:1.18.0")
}

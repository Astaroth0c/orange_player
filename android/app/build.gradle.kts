plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val releaseStoreFile = providers.environmentVariable("ORANGE_STORE_FILE").orNull
val releaseStorePassword = providers.environmentVariable("ORANGE_STORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("ORANGE_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("ORANGE_KEY_PASSWORD").orNull
val releaseSigningValues = listOf(releaseStoreFile, releaseStorePassword, releaseKeyAlias, releaseKeyPassword)
require(releaseSigningValues.all { it == null } || releaseSigningValues.all { it != null }) {
    "Configure all four ORANGE_* signing environment variables together to sign a release APK."
}

android {
    namespace = "com.orangeplayer.poc"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.orangeplayer.poc"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    kotlinOptions { jvmTarget = JavaVersion.VERSION_21.toString() }
    if (releaseSigningValues.all { it != null }) {
        signingConfigs.create("release") {
            storeFile = file(releaseStoreFile!!)
            storePassword = releaseStorePassword
            keyAlias = releaseKeyAlias
            keyPassword = releaseKeyPassword
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            if (releaseSigningValues.all { it != null }) signingConfig = signingConfigs.getByName("release")
        }
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

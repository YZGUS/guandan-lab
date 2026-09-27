package com.yzgus.guandan.android

import android.content.Intent
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.io.File
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith

/** Opt-in, stepwise physical-device review. Each command produces a screenshot and UI tree. */
@RunWith(AndroidJUnit4::class)
class DeviceReviewTest {
    @Test fun reviewWithScreenshots() {
        if (InstrumentationRegistry.getArguments().getString("interactiveReview") != "true") return
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val device = UiDevice.getInstance(instrumentation)
        val directory = File(context.filesDir, "device-review").apply { mkdirs() }
        val requestFile = File(directory, "request.json")
        var lastId = ""
        val deadline = SystemClock.uptimeMillis() + 30 * 60_000
        context.startActivity(context.packageManager.getLaunchIntentForPackage(context.packageName)!!.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
        while (SystemClock.uptimeMillis() < deadline) {
            val request = runCatching { JSONObject(requestFile.readText()) }.getOrNull()
            if (request == null || request.optString("id") == lastId) {
                SystemClock.sleep(150)
                continue
            }
            lastId = request.getString("id")
            val result = JSONObject().put("id", lastId)
            val action = request.getString("action")
            try {
                when (action) {
                    "clickText" -> device.wait(Until.findObject(By.text(request.getString("text"))), 5_000)!!.click()
                    "input" -> device.findObject(By.clazz("android.widget.EditText")).text = request.getString("text")
                    "tap" -> device.click(request.getInt("x"), request.getInt("y"))
                    "back" -> device.pressBack()
                    "home" -> device.pressHome()
                    "launch" -> context.startActivity(context.packageManager.getLaunchIntentForPackage(context.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    "portrait" -> device.setOrientationNatural()
                    "landscape" -> device.setOrientationLeft()
                    "swipe" -> device.swipe(request.getInt("x"), request.getInt("y"), request.getInt("toX"), request.getInt("toY"), 30)
                    "stop" -> device.unfreezeRotation()
                }
                SystemClock.sleep(request.optLong("settleMs", 800).coerceIn(0, 15_000))
                result.put("ok", true)
            } catch (error: Exception) {
                result.put("ok", false).put("error", error.javaClass.simpleName)
            }
            device.takeScreenshot(File(directory, "screen.png"))
            device.dumpWindowHierarchy(File(directory, "window.xml"))
            File(directory, "result.json").writeText(result.toString())
            if (action == "stop") break
        }
    }
}

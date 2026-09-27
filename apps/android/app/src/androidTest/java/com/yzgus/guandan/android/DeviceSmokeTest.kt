package com.yzgus.guandan.android

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DeviceSmokeTest {
    private lateinit var device: UiDevice

    @Before
    fun launchApp() {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)!!.apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        assertNotNull(device.wait(Until.findObject(By.text("扫描局域网")), 5_000))
    }

    @Test
    fun localAndCloudDiscoveryOpenTheSharedWebClient() {
        val input = device.findObject(By.clazz("android.widget.EditText"))
        input.click()
        device.pressBack()
        assertNotNull(device.wait(Until.findObject(By.text("扫描局域网")), 2_000))

        device.findObject(By.text("扫描局域网")).click()
        val localEndpoint = device.wait(Until.findObject(By.textContains(":8788")), 20_000)
        assertNotNull(localEndpoint)
        localEndpoint.parent.click()
        assertNotNull(device.wait(Until.findObject(By.clazz("android.webkit.WebView")), 8_000))

        device.pressBack()
        assertNotNull(device.wait(Until.findObject(By.text("扫描云端")), 4_000))
        val cloudInput = device.findObject(By.clazz("android.widget.EditText"))
        cloudInput.text = "https://49.233.153.141/guandan"
        device.findObject(By.text("扫描云端")).click()
        assertNotNull(device.wait(Until.findObject(By.text("https://49.233.153.141/guandan")), 12_000))
    }
}

package com.remotecompose

import java.io.InputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** A document is read to the end only while it stays within the size limit. */
class ReadAtMostTest {
    @Test
    fun `a document within the limit is read whole`() {
        val bytes = ByteArray(10_000) { it.toByte() }
        assertArrayEquals(bytes, bytes.inputStream().readAtMost(bytes.size))
    }

    @Test
    fun `a document over the limit is refused`() {
        assertThrows(DocumentTooLargeException::class.java) { ByteArray(101).inputStream().readAtMost(100) }
    }

    @Test
    fun `an endless stream is refused soon after the limit instead of being read to the end`() {
        val endless = CountingZeros()
        assertThrows(DocumentTooLargeException::class.java) { endless.readAtMost(1_000) }
        assertTrue("read ${endless.served} bytes", endless.served < 1_000 + 64 * 1024)
    }

    private class CountingZeros : InputStream() {
        var served = 0L

        override fun read(): Int = 0.also { served++ }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            b.fill(0, off, off + len)
            served += len
            return len
        }
    }
}

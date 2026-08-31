// Minimal stand-in for androidx.compose.ui.graphics. Separate file because a
// Kotlin source file carries exactly one package declaration.
// Long, not Int: 0xffffffff is 4294967295, past Int.MAX_VALUE, so Kotlin types
// the literal Long. Used by ci/compile-native-output.mjs (#81).
package androidx.compose.ui.graphics

class Color(val value: Long)

// Minimal stand-in for androidx.compose.ui.unit, so kotlinc can typecheck
// generated Tokens.kt without Compose on the classpath. Not Compose: real Dp is
// a value class. Asserts only that the expression resolves and typechecks.
// Used by ci/compile-native-output.mjs (#81).
package androidx.compose.ui.unit

class Dp(val value: Double)
class TextUnit(val value: Double)

val Double.dp: Dp get() = Dp(this)
val Double.sp: TextUnit get() = TextUnit(this)
val Double.em: TextUnit get() = TextUnit(this)

import 'package:flutter/services.dart';

/// Capitalizes the first letter of every word while typing or pasting.
/// Use together with `textCapitalization: TextCapitalization.words` so the
/// soft keyboard also starts words with shift enabled.
class CapitalizeWordsTextFormatter extends TextInputFormatter {
  const CapitalizeWordsTextFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final text = newValue.text;
    if (text.isEmpty) return newValue;

    final buffer = StringBuffer();
    var startOfWord = true;
    for (var i = 0; i < text.length; i++) {
      final ch = text[i];
      if (startOfWord && ch.toLowerCase() != ch.toUpperCase()) {
        buffer.write(ch.toUpperCase());
        startOfWord = false;
      } else {
        buffer.write(ch);
        if (ch.toLowerCase() == ch.toUpperCase()) {
          // Non-letter (space, digit, punctuation) starts a new word.
          startOfWord = true;
        }
      }
    }

    final formatted = buffer.toString();
    if (formatted == text) return newValue;
    return newValue.copyWith(text: formatted);
  }
}

/// Shared instance plus keyboard hint, for name/address style fields.
const capitalizeWordsFormatter = CapitalizeWordsTextFormatter();

/// Capitalizes the first letter of each sentence (after `.`, `!`, or `?`).
/// Use with `textCapitalization: TextCapitalization.sentences` on the keyboard.
class CapitalizeSentencesTextFormatter extends TextInputFormatter {
  const CapitalizeSentencesTextFormatter();

  static bool _isLetter(String ch) => ch.toLowerCase() != ch.toUpperCase();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final text = newValue.text;
    if (text.isEmpty) return newValue;

    final buffer = StringBuffer();
    var capitalizeNext = true;

    for (var i = 0; i < text.length; i++) {
      final ch = text[i];
      if (capitalizeNext && _isLetter(ch)) {
        buffer.write(ch.toUpperCase());
        capitalizeNext = false;
      } else {
        buffer.write(ch);
        if (_isLetter(ch)) capitalizeNext = false;
      }
      if (ch == '.' || ch == '!' || ch == '?') {
        capitalizeNext = true;
      }
    }

    final formatted = buffer.toString();
    if (formatted == text) return newValue;
    return newValue.copyWith(text: formatted);
  }
}

const capitalizeSentencesFormatter = CapitalizeSentencesTextFormatter();

/// Applies [CapitalizeSentencesTextFormatter] to a full string (e.g. loaded drafts).
String capitalizeSentences(String text) {
  if (text.isEmpty) return text;
  return capitalizeSentencesFormatter
      .formatEditUpdate(
        const TextEditingValue(text: ''),
        TextEditingValue(text: text),
      )
      .text;
}

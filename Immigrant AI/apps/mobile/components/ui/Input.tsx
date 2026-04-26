import { forwardRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

function EyeOpenIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <Path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    </Svg>
  );
}

function EyeOffIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <Path d="M1 1l22 22" />
    </Svg>
  );
}

type InputProps = Readonly<{
  label?: string;
  error?: string;
  hint?: string;
}> &
  TextInputProps;

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, editable = true, secureTextEntry, style, ...rest },
  ref
) {
  const [hidden, setHidden] = useState(true);
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.row}>
        <TextInput
          ref={ref}
          editable={editable}
          placeholderTextColor="#9ca3af"
          secureTextEntry={isPassword && hidden}
          style={[
            styles.input,
            isPassword && styles.inputPassword,
            error ? styles.inputError : styles.inputNormal,
            !editable && styles.inputDisabled,
            style,
          ]}
          {...rest}
        />

        {isPassword && (
          <Pressable
            onPress={() => setHidden((v) => !v)}
            hitSlop={12}
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            style={styles.eyeBtn}
          >
            {hidden ? <EyeOpenIcon /> : <EyeOffIcon />}
          </Pressable>
        )}
      </View>

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  row: {
    position: "relative",
    justifyContent: "center",
  },
  input: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
  inputPassword: {
    paddingRight: 52,
  },
  inputNormal: {
    borderColor: "#e5e7eb",
  },
  inputError: {
    borderColor: "#ff3b30",
  },
  inputDisabled: {
    opacity: 0.6,
  },
  eyeBtn: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 12,
    color: "#ff3b30",
  },
  hintText: {
    fontSize: 12,
    color: "#6b7280",
  },
});

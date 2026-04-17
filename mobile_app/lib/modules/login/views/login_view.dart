import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:glass_kit/glass_kit.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../core/values/app_constants.dart';
import '../controllers/login_controller.dart';

class LoginView extends GetView<LoginController> {
  const LoginView({super.key});

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final inset = MediaQuery.viewInsetsOf(context);
    final cardW = (size.width - 40).clamp(280.0, 440.0);
    final cardH = (size.height - inset.bottom - 48).clamp(480.0, 680.0);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        resizeToAvoidBottomInset: true,
        body: Stack(
          fit: StackFit.expand,
          children: [
            _GradientBackground(size: size),
            _AmbientOrbs(size: size),
            SafeArea(
              child: Align(
                alignment: Alignment.center,
                child: SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(20, 16, 20, inset.bottom + 20),
                  child: GlassContainer.frostedGlass(
                    height: cardH,
                    width: cardW,
                    blur: 26,
                    frostedOpacity: 0.14,
                    borderRadius: BorderRadius.circular(28),
                    borderWidth: 1.2,
                    borderGradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        AppColors.whiteOverlay(0.45),
                        AppColors.whiteOverlay(0.06),
                      ],
                    ),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        AppColors.whiteOverlay(0.08),
                        const Color(0x661e293b),
                        const Color(0x990f172a),
                      ],
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.blackOverlay(0.45),
                        blurRadius: 48,
                        offset: const Offset(0, 24),
                      ),
                    ],
                    padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
                    child: SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      child: Form(
                        key: controller.formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _BrandRow(),
                            const SizedBox(height: 28),
                            _HeaderText(),
                            const SizedBox(height: 28),
                            _EmailField(),
                            const SizedBox(height: 18),
                            _PasswordField(),
                            const SizedBox(height: 16),
                            _ErrorBanner(),
                            const SizedBox(height: 28),
                            _SignInButton(),
                            const SizedBox(height: 28),
                            _FooterHint(),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GradientBackground extends StatelessWidget {
  const _GradientBackground({required this.size});

  final Size size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size.width,
      height: size.height,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.gradientStart,
            AppColors.gradientMid,
            AppColors.gradientEnd,
          ],
        ),
      ),
    );
  }
}

class _AmbientOrbs extends StatelessWidget {
  const _AmbientOrbs({required this.size});

  final Size size;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: [
          Positioned(
            top: -size.height * 0.08,
            right: -size.width * 0.15,
            child: _Orb(
              diameter: size.width * 0.85,
              colors: [
                AppColors.primary.withValues(alpha: 0.12),
                Colors.transparent,
              ],
            ),
          ),
          Positioned(
            bottom: -size.height * 0.12,
            left: -size.width * 0.2,
            child: _Orb(
              diameter: size.width * 0.75,
              colors: [
                const Color(0xFF022C22).withValues(alpha: 0.5),
                Colors.transparent,
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Orb extends StatelessWidget {
  const _Orb({required this.diameter, required this.colors});

  final double diameter;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: diameter,
      height: diameter,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: colors,
        ),
      ),
    );
  }
}

class _BrandRow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 56,
          height: 56,
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                color: AppColors.blackOverlay(0.22),
                blurRadius: 14,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Image.asset(
            AppConstants.assetLogo,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
            errorBuilder: (_, __, ___) => _LogoFallback(),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                AppConstants.appName,
                style: GoogleFonts.inter(
                  fontSize: 22,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'CRM CONSOLE',
                style: GoogleFonts.inter(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 3.2,
                  color: AppColors.slate400,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Shown only if [assets/images/logo.jpg] fails to load.
class _LogoFallback extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: LinearGradient(
          colors: [AppColors.primary, AppColors.primaryDark],
        ),
      ),
      child: const Icon(Icons.hub_rounded, color: Colors.white, size: 26),
    );
  }
}

class _HeaderText extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Welcome back',
          style: GoogleFonts.inter(
            fontSize: 28,
            fontWeight: FontWeight.w900,
            height: 1.15,
            color: Colors.white,
            letterSpacing: -0.8,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'Log in to your CRM command center and keep your pipeline moving.',
          style: GoogleFonts.inter(
            fontSize: 14,
            height: 1.45,
            color: AppColors.slate400,
          ),
        ),
      ],
    );
  }
}

class _EmailField extends GetView<LoginController> {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'EMAIL ADDRESS',
          style: GoogleFonts.inter(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 1.2,
            color: AppColors.slate300,
          ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: controller.emailController,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          autofillHints: const [AutofillHints.email],
          style: GoogleFonts.inter(color: Colors.white, fontSize: 15),
          validator: controller.validateEmail,
          decoration: InputDecoration(
            hintText: 'you@company.com',
            hintStyle: GoogleFonts.inter(color: AppColors.slate500),
            prefixIcon: Icon(Icons.mail_outline_rounded, color: AppColors.slate400, size: 22),
            filled: true,
            fillColor: AppColors.whiteOverlay(0.06),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(color: AppColors.whiteOverlay(0.12)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(color: Colors.red.shade400),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(color: Colors.red.shade400),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
          ),
        ),
      ],
    );
  }
}

class _PasswordField extends GetView<LoginController> {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'PASSWORD',
          style: GoogleFonts.inter(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 1.2,
            color: AppColors.slate300,
          ),
        ),
        const SizedBox(height: 8),
        Obx(
          () => TextFormField(
            controller: controller.passwordController,
            obscureText: controller.obscurePassword.value,
            autofillHints: const [AutofillHints.password],
            style: GoogleFonts.inter(color: Colors.white, fontSize: 15),
            validator: controller.validatePassword,
            decoration: InputDecoration(
              hintText: '••••••••',
              hintStyle: GoogleFonts.inter(color: AppColors.slate500),
              prefixIcon: Icon(Icons.lock_outline_rounded, color: AppColors.slate400, size: 22),
              suffixIcon: IconButton(
                onPressed: controller.togglePasswordVisibility,
                icon: Icon(
                  controller.obscurePassword.value
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  color: AppColors.slate400,
                  size: 22,
                ),
              ),
              filled: true,
              fillColor: AppColors.whiteOverlay(0.06),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(color: AppColors.whiteOverlay(0.12)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
              ),
              errorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(color: Colors.red.shade400),
              ),
              focusedErrorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(color: Colors.red.shade400),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
            ),
          ),
        ),
      ],
    );
  }
}

class _ErrorBanner extends GetView<LoginController> {
  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final msg = controller.errorMessage.value;
      if (msg == null || msg.isEmpty) return const SizedBox.shrink();
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0x33F87171),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0x55F87171)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.error_outline_rounded, color: Colors.red.shade200, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                msg,
                style: GoogleFonts.inter(
                  fontSize: 13,
                  height: 1.35,
                  color: Colors.red.shade100,
                ),
              ),
            ),
          ],
        ),
      );
    });
  }
}

class _SignInButton extends GetView<LoginController> {
  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final loading = controller.isLoading.value;
      return SizedBox(
        width: double.infinity,
        height: 52,
        child: ElevatedButton(
          onPressed: loading ? null : controller.submit,
          style: ElevatedButton.styleFrom(
            elevation: 0,
            shadowColor: AppColors.primary.withValues(alpha: 0.45),
            backgroundColor: AppColors.primary,
            disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.45),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          ),
          child: loading
              ? SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: Colors.white.withValues(alpha: 0.95),
                  ),
                )
              : Text(
                  'SIGN IN',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
        ),
      );
    });
  }
}

class _FooterHint extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Text(
      'Secure sign-in · Same credentials as the WorkPilot web app',
      textAlign: TextAlign.center,
      style: GoogleFonts.inter(
        fontSize: 11,
        height: 1.4,
        color: AppColors.slate500,
      ),
    );
  }
}

import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../core/values/app_constants.dart';
import '../../../data/models/mobile_profile.dart';
import '../id_card_controller.dart';
import 'id_card_curved_divider.dart';

/// Lanyard + holder frame with flippable front/back card (tap right edge to flip).
class FlippableIdBadge extends StatefulWidget {
  const FlippableIdBadge({
    super.key,
    required this.profile,
    required this.photoBytes,
    required this.controller,
  });

  final MobileProfile? profile;
  final Uint8List? photoBytes;
  final IdCardController controller;

  @override
  State<FlippableIdBadge> createState() => _FlippableIdBadgeState();
}

class _IdCardLayout {
  const _IdCardLayout({
    required this.cardWidth,
    required this.cardHeight,
    required this.flipStripWidth,
    required this.scale,
  });

  final double cardWidth;
  final double cardHeight;
  final double flipStripWidth;
  final double scale;

  static _IdCardLayout of(BuildContext context) {
    final screen = MediaQuery.sizeOf(context);
    final pad = 32.0;
    const flipStrip = 48.0;
    final maxW = screen.width - pad - flipStrip;
    final cardW = maxW.clamp(232.0, 300.0);
    // CR80-ish aspect; cap height so it fits smaller phones with app bar + lanyard
    final idealH = cardW * 1.52;
    final maxH = (screen.height * 0.52).clamp(340.0, 460.0);
    final cardH = math.min(idealH, maxH);
    final refW = 268.0;
    return _IdCardLayout(
      cardWidth: cardW,
      cardHeight: cardH,
      flipStripWidth: flipStrip,
      scale: cardW / refW,
    );
  }
}

class _FlippableIdBadgeState extends State<FlippableIdBadge> with SingleTickerProviderStateMixin {
  late final AnimationController _flip;

  @override
  void initState() {
    super.initState();
    _flip = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
      value: widget.controller.showFront.value ? 0 : 1,
    );
  }

  @override
  void dispose() {
    _flip.dispose();
    super.dispose();
  }

  void _toggleFlip() {
    final toBack = widget.controller.showFront.value;
    widget.controller.showFront.value = !toBack;
    _flip.animateTo(toBack ? 1.0 : 0.0, curve: Curves.easeInOutCubic);
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.profile;
    final bytes = widget.photoBytes;
    final ctrl = widget.controller;
    final layout = _IdCardLayout.of(context);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _LanyardAssembly(scale: layout.scale),
        const SizedBox(height: 4),
        _CardHolderFrame(
          child: SizedBox(
            width: layout.cardWidth + layout.flipStripWidth,
            height: layout.cardHeight,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  left: 0,
                  top: 0,
                  width: layout.cardWidth,
                  height: layout.cardHeight,
                  child: AnimatedBuilder(
                    animation: _flip,
                    builder: (context, _) {
                      final angle = _flip.value * math.pi;
                      final showBack = angle > math.pi / 2;
                      return Transform(
                        alignment: Alignment.center,
                        transform: Matrix4.identity()
                          ..setEntry(3, 2, 0.0012)
                          ..rotateY(angle),
                        child: showBack
                            ? Transform(
                                alignment: Alignment.center,
                                transform: Matrix4.identity()..rotateY(math.pi),
                                child: _IdCardBackFace(
                                  profile: p,
                                  controller: ctrl,
                                  layout: layout,
                                ),
                              )
                            : _IdCardFrontFace(
                                profile: p,
                                photoBytes: bytes,
                                controller: ctrl,
                                layout: layout,
                              ),
                      );
                    },
                  ),
                ),
                Positioned(
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: layout.flipStripWidth,
                  child: Obx(
                    () => _FlipStrip(
                      onTap: _toggleFlip,
                      isFront: widget.controller.showFront.value,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Obx(() {
          final front = widget.controller.showFront.value;
          return Text(
            front ? 'Tap the right edge to view back' : 'Tap the right edge to view front',
            style: GoogleFonts.inter(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: Colors.white.withValues(alpha: 0.72),
            ),
          );
        }),
      ],
    );
  }
}

// —— Lanyard & metal clip ———————————————————————————————————————————————————

class _LanyardAssembly extends StatelessWidget {
  const _LanyardAssembly({required this.scale});

  final double scale;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 120 * scale,
      height: 88 * scale,
      child: Stack(
        alignment: Alignment.topCenter,
        children: [
          Positioned(
            top: 0,
            left: 18,
            right: 18,
            child: CustomPaint(
              size: const Size(84, 56),
              painter: _LanyardStrapPainter(),
            ),
          ),
          Positioned(
            top: 48,
            child: Column(
              children: [
                Container(
                  width: 22,
                  height: 10,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(3),
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        const Color(0xFFE8ECF0),
                        const Color(0xFF9CA3AF),
                        const Color(0xFFD1D5DB),
                      ],
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.35),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFF9CA3AF), width: 2),
                    gradient: const RadialGradient(
                      colors: [Color(0xFFF3F4F6), Color(0xFF6B7280)],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LanyardStrapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final paint = Paint()..style = PaintingStyle.stroke..strokeWidth = 10..strokeCap = StrokeCap.round;

    // Left strap
    paint.shader = LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [AppColors.primary, AppColors.primaryDark],
    ).createShader(Rect.fromLTWH(0, 0, w / 2, size.height));
    canvas.drawLine(Offset(w * 0.12, 0), Offset(w * 0.42, size.height * 0.92), paint);

    // Right strap
    paint.shader = LinearGradient(
      begin: Alignment.topRight,
      end: Alignment.bottomLeft,
      colors: [AppColors.primary.withValues(alpha: 0.85), AppColors.primaryDark],
    ).createShader(Rect.fromLTWH(w / 2, 0, w / 2, size.height));
    canvas.drawLine(Offset(w * 0.88, 0), Offset(w * 0.58, size.height * 0.92), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// —— Black holder frame ———————————————————————————————————————————————————————

class _CardHolderFrame extends StatelessWidget {
  const _CardHolderFrame({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 14, 10, 12),
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.55),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
        border: Border.all(color: const Color(0xFF1F2937), width: 1.5),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56,
            height: 10,
            margin: const EdgeInsets.only(bottom: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF0B0F14),
              borderRadius: BorderRadius.circular(3),
              border: Border.all(color: const Color(0xFF374151)),
            ),
          ),
          child,
        ],
      ),
    );
  }
}

// —— Right-edge flip control —————————————————————————————————————————————————

class _FlipStrip extends StatelessWidget {
  const _FlipStrip({required this.onTap, required this.isFront});

  final VoidCallback onTap;
  final bool isFront;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: const BorderRadius.horizontal(right: Radius.circular(10)),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: const BorderRadius.horizontal(right: Radius.circular(10)),
            gradient: LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: [
                Colors.transparent,
                AppColors.primary.withValues(alpha: 0.12),
                AppColors.primary.withValues(alpha: 0.28),
              ],
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                isFront ? Icons.chevron_right_rounded : Icons.chevron_left_rounded,
                color: AppColors.primary,
                size: 28,
              ),
              const SizedBox(height: 6),
              RotatedBox(
                quarterTurns: 1,
                child: Text(
                  'FLIP',
                  style: GoogleFonts.inter(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 2,
                    color: AppColors.primary.withValues(alpha: 0.9),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// —— Front face (light corporate) —————————————————————————————————————————————

class _IdCardFrontFace extends StatelessWidget {
  const _IdCardFrontFace({
    required this.profile,
    required this.photoBytes,
    required this.controller,
    required this.layout,
  });

  final MobileProfile? profile;
  final Uint8List? photoBytes;
  final IdCardController controller;
  final _IdCardLayout layout;

  @override
  Widget build(BuildContext context) {
    final name = profile?.fullName.trim();
    final displayName = name != null && name.isNotEmpty ? name : 'TEAM MEMBER';
    final role = profile?.rolePosition?.trim();
    final dept = profile?.department?.trim();
    final mobile = profile?.mobilePhone?.trim() ?? profile?.phone?.trim();
    final email = profile?.email?.trim();
    final initial = displayName.isNotEmpty ? displayName[0].toUpperCase() : '?';
    const ink = Color(0xFF0F4C5C);
    const band = Color(0xFF0D9488);
    final s = layout.scale;
    final photoR = (42 * s).clamp(34.0, 48.0);

    return Container(
      width: layout.cardWidth,
      height: layout.cardHeight,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(7),
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                physics: const ClampingScrollPhysics(),
                padding: EdgeInsets.fromLTRB(12 * s, 12 * s, 12 * s, 8 * s),
                child: Column(
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _CompanyMark(compact: true, tint: ink, scale: s),
                        SizedBox(width: 8 * s),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                controller.companyName.toUpperCase(),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.inter(
                                  fontSize: 9 * s,
                                  fontWeight: FontWeight.w800,
                                  height: 1.25,
                                  letterSpacing: 0.4,
                                  color: ink,
                                ),
                              ),
                              SizedBox(height: 4 * s),
                              Text(
                                'SMART · SECURE · SEAMLESS',
                                style: GoogleFonts.inter(
                                  fontSize: 10 * s,
                                  fontWeight: FontWeight.w900,
                                  height: 1.2,
                                  letterSpacing: 0.4,
                                  color: ink,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 8 * s),
                    const IdCardCurvedDivider(color: Color(0xFF94A3B8)),
                    SizedBox(height: 6 * s),
                    Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: band, width: 2.5),
                      ),
                      child: CircleAvatar(
                        radius: photoR,
                        backgroundColor: const Color(0xFFF1F5F9),
                        backgroundImage: photoBytes != null ? MemoryImage(photoBytes!) : null,
                        child: photoBytes == null
                            ? Text(
                                initial,
                                style: GoogleFonts.inter(
                                  fontSize: photoR * 0.7,
                                  fontWeight: FontWeight.w800,
                                  color: ink,
                                ),
                              )
                            : null,
                      ),
                    ),
                    SizedBox(height: 10 * s),
                    Text(
                      displayName.toUpperCase(),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(
                        fontSize: 14 * s,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.6,
                        color: ink,
                        height: 1.15,
                      ),
                    ),
                    if (role != null && role.isNotEmpty) ...[
                      SizedBox(height: 4 * s),
                      Text(
                        role,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.inter(
                          fontSize: 11 * s,
                          fontWeight: FontWeight.w500,
                          color: const Color(0xFF64748B),
                        ),
                      ),
                    ],
                    if (dept != null && dept.isNotEmpty) ...[
                      SizedBox(height: 2 * s),
                      Text(
                        dept,
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.inter(fontSize: 10 * s, color: const Color(0xFF94A3B8)),
                      ),
                    ],
                    SizedBox(height: 10 * s),
                    _FrontInfoPanel(
                      scale: s,
                      status: controller.statusLabel,
                      employeeId: controller.idLabel,
                      mobile: mobile,
                      email: email,
                      isOfficer: profile?.isOfficer ?? false,
                    ),
                  ],
                ),
              ),
            ),
            Container(
              width: double.infinity,
              padding: EdgeInsets.symmetric(horizontal: 14 * s, vertical: 10 * s),
              color: band,
              child: Row(
                children: [
                  Expanded(
                    child: _FooterField(
                      label: 'Employee ID',
                      value: controller.idLabel,
                      light: true,
                      scale: s,
                    ),
                  ),
                  Container(width: 1, height: 28 * s, color: Colors.white.withValues(alpha: 0.35)),
                  SizedBox(width: 10 * s),
                  Expanded(
                    child: _FooterField(
                      label: 'Status',
                      value: controller.statusLabel,
                      light: true,
                      scale: s,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// —— Back face (dark contact) —————————————————————————————————————————————————

class _IdCardBackFace extends StatelessWidget {
  const _IdCardBackFace({
    required this.profile,
    required this.controller,
    required this.layout,
  });

  final MobileProfile? profile;
  final IdCardController controller;
  final _IdCardLayout layout;

  @override
  Widget build(BuildContext context) {
    final mobile = profile?.mobilePhone?.trim() ?? profile?.phone?.trim();
    final landline = profile?.landlinePhone?.trim();
    final email = profile?.email?.trim();
    final address = profile?.profileAddress?.trim();
    final kinName = profile?.nextOfKinName?.trim();
    final kinPhone = profile?.nextOfKinPhone?.trim();
    final kinRel = profile?.nextOfKinRelationship?.trim();
    final notes = profile?.profileNotes?.trim();
    const band = AppColors.primaryDark;
    const bg = Color(0xFF0F4C5C);
    final s = layout.scale;

    final hasContact = [
      mobile,
      landline,
      email,
      address,
      kinName,
      notes,
    ].any((v) => v != null && v.isNotEmpty);

    return Container(
      width: layout.cardWidth,
      height: layout.cardHeight,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.5)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(7),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(12 * s, 12 * s, 12 * s, 6 * s),
              child: Column(
                children: [
                  _CompanyMark(compact: false, tint: Colors.white, scale: s),
                  SizedBox(height: 6 * s),
                  Text(
                    'CONTACT DETAILS',
                    style: GoogleFonts.inter(
                      fontSize: 10 * s,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.5,
                      color: AppColors.primary,
                    ),
                  ),
                  SizedBox(height: 8 * s),
                  const IdCardCurvedDivider(color: Color(0xFF5EEAD4)),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                physics: const ClampingScrollPhysics(),
                padding: EdgeInsets.fromLTRB(12 * s, 0, 12 * s, 8 * s),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (!hasContact)
                      Text(
                        'Add contact details in Edit profile',
                        textAlign: TextAlign.center,
                        style: GoogleFonts.inter(
                          fontSize: 11 * s,
                          color: AppColors.slate400,
                          height: 1.4,
                        ),
                      ),
                    if (mobile != null && mobile.isNotEmpty)
                      _BackRow(
                        scale: s,
                        icon: Icons.phone_android_rounded,
                        label: 'Mobile',
                        value: mobile,
                      ),
                    if (landline != null && landline.isNotEmpty)
                      _BackRow(scale: s, icon: Icons.phone_rounded, label: 'Phone', value: landline),
                    if (email != null && email.isNotEmpty)
                      _BackRow(scale: s, icon: Icons.email_outlined, label: 'Email', value: email),
                    if (address != null && address.isNotEmpty)
                      _BackRow(
                        scale: s,
                        icon: Icons.location_on_outlined,
                        label: 'Address',
                        value: address,
                        maxLines: 3,
                      ),
                    if (kinName != null && kinName.isNotEmpty) ...[
                      SizedBox(height: 6 * s),
                      _BackSection(
                        scale: s,
                        title: 'Emergency contact',
                        lines: [
                          kinName,
                          if (kinRel != null && kinRel.isNotEmpty) kinRel,
                          if (kinPhone != null && kinPhone.isNotEmpty) kinPhone,
                        ],
                      ),
                    ],
                    if (notes != null && notes.isNotEmpty) ...[
                      SizedBox(height: 6 * s),
                      _BackSection(scale: s, title: 'Notes', lines: [notes], maxLines: 4),
                    ],
                  ],
                ),
              ),
            ),
            Container(
              width: double.infinity,
              padding: EdgeInsets.symmetric(horizontal: 12 * s, vertical: 10 * s),
              color: band,
              child: Text(
                controller.idLabel,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.inter(
                  fontSize: 10 * s,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Mid-card summary on the front (fills empty space with real profile data).
class _FrontInfoPanel extends StatelessWidget {
  const _FrontInfoPanel({
    required this.scale,
    required this.status,
    required this.employeeId,
    required this.mobile,
    required this.email,
    required this.isOfficer,
  });

  final double scale;
  final String status;
  final String employeeId;
  final String? mobile;
  final String? email;
  final bool isOfficer;

  @override
  Widget build(BuildContext context) {
    final s = scale;
    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(horizontal: 10 * s, vertical: 10 * s),
      decoration: BoxDecoration(
        color: const Color(0xFFF0FDFA),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF99F6E4)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _FrontInfoLine(
                  scale: s,
                  label: 'Account type',
                  value: isOfficer ? 'Field officer' : 'Staff user',
                ),
              ),
              Container(
                padding: EdgeInsets.symmetric(horizontal: 8 * s, vertical: 4 * s),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  status,
                  style: GoogleFonts.inter(
                    fontSize: 8 * s,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primaryDark,
                  ),
                ),
              ),
            ],
          ),
          Divider(height: 14 * s, color: const Color(0xFFCCFBF1)),
          _FrontInfoLine(scale: s, label: 'ID number', value: employeeId),
          if (mobile != null && mobile!.isNotEmpty) ...[
            SizedBox(height: 6 * s),
            _FrontInfoLine(scale: s, label: 'Mobile', value: mobile!, icon: Icons.phone_android_outlined),
          ],
          if (email != null && email!.isNotEmpty) ...[
            SizedBox(height: 6 * s),
            _FrontInfoLine(
              scale: s,
              label: 'Email',
              value: email!,
              icon: Icons.email_outlined,
              maxLines: 2,
            ),
          ],
        ],
      ),
    );
  }
}

class _FrontInfoLine extends StatelessWidget {
  const _FrontInfoLine({
    required this.scale,
    required this.label,
    required this.value,
    this.icon,
    this.maxLines = 1,
  });

  final double scale;
  final String label;
  final String value;
  final IconData? icon;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    final s = scale;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 14 * s, color: const Color(0xFF0D9488)),
          SizedBox(width: 6 * s),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 8 * s,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF64748B),
                  letterSpacing: 0.3,
                ),
              ),
              Text(
                value,
                maxLines: maxLines,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.inter(
                  fontSize: 11 * s,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFF0F4C5C),
                  height: 1.3,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CompanyMark extends StatelessWidget {
  const _CompanyMark({
    required this.compact,
    required this.tint,
    this.scale = 1,
  });

  final bool compact;
  final Color tint;
  final double scale;

  @override
  Widget build(BuildContext context) {
    final base = compact ? 36.0 : 40.0;
    final size = base * scale;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: tint.withValues(alpha: 0.35)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(7),
        child: Image.asset(
          AppConstants.assetLogo,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Icon(
            Icons.bolt_rounded,
            color: tint,
            size: size * 0.55,
          ),
        ),
      ),
    );
  }
}

class _FooterField extends StatelessWidget {
  const _FooterField({
    required this.label,
    required this.value,
    this.light = false,
    this.scale = 1,
  });

  final String label;
  final String value;
  final bool light;
  final double scale;

  @override
  Widget build(BuildContext context) {
    final s = scale;
    final labelColor = light ? Colors.white.withValues(alpha: 0.75) : AppColors.slate500;
    final valueColor = light ? Colors.white : AppColors.slate900;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.inter(fontSize: 8 * s, fontWeight: FontWeight.w600, color: labelColor),
        ),
        SizedBox(height: 2 * s),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.inter(fontSize: 11 * s, fontWeight: FontWeight.w800, color: valueColor),
        ),
      ],
    );
  }
}

class _BackRow extends StatelessWidget {
  const _BackRow({
    required this.scale,
    required this.icon,
    required this.label,
    required this.value,
    this.maxLines = 2,
  });

  final double scale;
  final IconData icon;
  final String label;
  final String value;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    final s = scale;
    return Padding(
      padding: EdgeInsets.only(bottom: 8 * s),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15 * s, color: AppColors.primary),
          SizedBox(width: 8 * s),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.inter(
                    fontSize: 8 * s,
                    fontWeight: FontWeight.w600,
                    color: AppColors.slate400,
                    letterSpacing: 0.5,
                  ),
                ),
                Text(
                  value,
                  maxLines: maxLines,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.inter(
                    fontSize: 11 * s,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BackSection extends StatelessWidget {
  const _BackSection({
    required this.scale,
    required this.title,
    required this.lines,
    this.maxLines = 2,
  });

  final double scale;
  final String title;
  final List<String> lines;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    final s = scale;
    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(8 * s),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: GoogleFonts.inter(
              fontSize: 8 * s,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
              color: AppColors.primary,
            ),
          ),
          SizedBox(height: 4 * s),
          for (final line in lines)
            if (line.isNotEmpty)
              Padding(
                padding: EdgeInsets.only(bottom: 2 * s),
                child: Text(
                  line,
                  maxLines: maxLines,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.inter(fontSize: 10 * s, color: Colors.white, height: 1.3),
                ),
              ),
        ],
      ),
    );
  }
}

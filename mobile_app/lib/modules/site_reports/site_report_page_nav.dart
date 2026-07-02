import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';

class SiteReportPageNav extends StatelessWidget {
  const SiteReportPageNav({
    super.key,
    required this.pageIndex,
    required this.pageCount,
    required this.pageLabels,
    required this.onSelectPage,
    required this.onBack,
    required this.onNext,
    required this.isFirstPage,
    required this.isLastPage,
    this.onDone,
    this.saving = false,
  });

  final int pageIndex;
  final int pageCount;
  final List<String> pageLabels;
  final ValueChanged<int> onSelectPage;
  final VoidCallback onBack;
  final VoidCallback onNext;
  final bool isFirstPage;
  final bool isLastPage;
  final VoidCallback? onDone;
  final bool saving;

  @override
  Widget build(BuildContext context) {
    if (pageCount <= 1) return const SizedBox.shrink();

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 40,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: pageLabels.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final active = i == pageIndex;
              return ChoiceChip(
                label: Text(
                  pageLabels[i],
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: active ? Colors.white : AppColors.slate300,
                  ),
                ),
                selected: active,
                onSelected: (_) => onSelectPage(i),
                selectedColor: AppColors.primary,
                backgroundColor: AppColors.whiteOverlay(0.08),
                side: BorderSide(color: active ? AppColors.primary : AppColors.whiteOverlay(0.12)),
                padding: const EdgeInsets.symmetric(horizontal: 4),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Row(
            children: [
              TextButton(
                onPressed: isFirstPage ? null : onBack,
                child: Text(
                  'Back',
                  style: GoogleFonts.inter(
                    color: isFirstPage ? AppColors.slate500 : Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Expanded(
                child: Text(
                  'Page ${pageIndex + 1} of $pageCount',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
              if (isLastPage && onDone != null)
                FilledButton(
                  onPressed: saving ? null : onDone,
                  child: saving
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900))
                      : Text('Done', style: GoogleFonts.inter(fontWeight: FontWeight.w800)),
                )
              else
                FilledButton(
                  onPressed: onNext,
                  child: Text('Next', style: GoogleFonts.inter(fontWeight: FontWeight.w800)),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

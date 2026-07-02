import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import '../../data/models/job_completion_context.dart';
import '../../data/post_report_job_stages.dart';

/// Explains multi-engineer job stage rules on the job report and complete-visit flows.
class JobCompletionContextPanel extends StatelessWidget {
  const JobCompletionContextPanel({
    super.key,
    required this.context,
    this.selectedNextJobState,
    this.compact = false,
  });

  final JobCompletionContext context;
  final String? selectedNextJobState;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    if (!this.context.hasMultipleEngineers) {
      return const SizedBox.shrink();
    }

    final children = <Widget>[];

    if (this.context.isLastEngineerToComplete) {
      children.addAll(_lastEngineerCards());
    } else {
      children.add(
        _infoCard(
          icon: Icons.groups_rounded,
          color: const Color(0xFF38BDF8),
          background: const Color(0x221E3A8A),
          border: const Color(0x5538BDF8),
          title: 'Multiple engineers on this job',
          body: _multiEngineerIntro(),
        ),
      );
      if (selectedNextJobState != null &&
          selectedNextJobState!.trim().isNotEmpty) {
        children.add(const SizedBox(height: 10));
        children.add(
          _infoCard(
            icon: Icons.flag_rounded,
            color: AppColors.primary,
            background: AppColors.primary.withValues(alpha: 0.12),
            border: AppColors.primary.withValues(alpha: 0.35),
            title: 'If you finish last',
            body:
                'The job will move to **${describePostReportJobState(selectedNextJobState)}** once every engineer has completed their visit.',
          ),
        );
      }
    }

    if (!this.context.isLastEngineerToComplete &&
        this.context.hasStageConflict) {
      children.add(const SizedBox(height: 10));
      children.add(
        _infoCard(
          icon: Icons.warning_amber_rounded,
          color: const Color(0xFFFBBF24),
          background: const Color(0x22F59E0B),
          border: const Color(0x66FBBF24),
          title: 'Different choices on this job',
          body: _conflictBody(),
        ),
      );
    } else if (!this.context.isLastEngineerToComplete &&
        this.context.otherSiblingsWithStageChoice.isNotEmpty) {
      children.add(const SizedBox(height: 10));
      children.add(
        _infoCard(
          icon: Icons.people_outline_rounded,
          color: AppColors.slate500,
          background: AppColors.slate100,
          border: AppColors.slate200,
          title: 'Other engineers',
          body: _siblingChoicesBody(this.context.otherSiblingsWithStageChoice),
        ),
      );
    }

    if (!compact && !this.context.isLastEngineerToComplete &&
        this.context.openVisitCount > 1) {
      children.add(const SizedBox(height: 10));
      children.add(
        Text(
          '${this.context.openVisitCount} visits still open on this job.',
          style: GoogleFonts.inter(
            fontSize: 12,
            color: AppColors.slate400,
            height: 1.35,
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    );
  }

  List<Widget> _lastEngineerCards() {
    final currentStage = describeCurrentJobState(
      this.context.currentJobState,
    );
    final myChoice = selectedNextJobState?.trim().isNotEmpty == true
        ? describePostReportJobState(selectedNextJobState)
        : null;

    final cards = <Widget>[
      _infoCard(
        icon: Icons.person_pin_rounded,
        color: const Color(0xFF34D399),
        background: const Color(0x2210B981),
        border: const Color(0x5534D399),
        title: 'You are the last engineer',
        body: myChoice != null
            ? 'Everyone else has finished. The job is currently **$currentStage**. '
                'When you complete your visit, it will move to **$myChoice**.'
            : 'Everyone else has finished. The job is currently **$currentStage**. '
                'Your choice below will set the final job stage when you complete your visit.',
      ),
      const SizedBox(height: 10),
      _infoCard(
        icon: Icons.timeline_rounded,
        color: AppColors.slate500,
        background: AppColors.slate100,
        border: AppColors.slate200,
        title: 'Current job stage',
        body: '**$currentStage** — this is what the office sees on this job right now.',
      ),
    ];

    if (this.context.finishedSiblingChoices.isNotEmpty) {
      cards.add(const SizedBox(height: 10));
      cards.add(
        _infoCard(
          icon: Icons.check_circle_outline_rounded,
          color: AppColors.slate500,
          background: AppColors.slate100,
          border: AppColors.slate200,
          title: 'Engineers who already finished',
          body: _finishedChoicesBody(),
        ),
      );
    }

    if (this.context.hasStageConflict) {
      cards.add(const SizedBox(height: 10));
      cards.add(
        _infoCard(
          icon: Icons.warning_amber_rounded,
          color: const Color(0xFFFBBF24),
          background: const Color(0x22F59E0B),
          border: const Color(0x66FBBF24),
          title: 'Different choices were made',
          body:
              'Other engineers chose different next steps, but **your choice decides** because you are finishing last.',
        ),
      );
    }

    return cards;
  }

  String _multiEngineerIntro() {
    final openOthers = this.context.otherOpenSiblings.length;
    if (openOthers > 0) {
      return 'The job stage only updates after **every engineer completes their visit**. '
          '**$openOthers** other engineer${openOthers == 1 ? '' : 's'} still need${openOthers == 1 ? 's' : ''} to finish. '
          'Whoever completes **last** decides the final job stage.';
    }
    return 'The job stage only updates after **every engineer completes their visit**. '
        'Whoever completes **last** decides the final job stage.';
  }

  String _finishedChoicesBody() {
    final buffer = StringBuffer();
    for (final s in this.context.finishedSiblingChoices) {
      final who = s.officerFullName?.trim().isNotEmpty == true
          ? s.officerFullName!.trim()
          : 'Another engineer';
      final stage = s.nextJobState != null && s.nextJobState!.trim().isNotEmpty
          ? describePostReportJobState(s.nextJobState)
          : 'No stage recorded';
      buffer.writeln('• $who — chose **$stage**');
    }
    return buffer.toString().trim();
  }

  String _conflictBody() {
    final buffer = StringBuffer(
      'Engineers on this job chose different next steps. The job will use the choice of whoever completes **last**:\n\n',
    );
    for (final s in this.context.siblings) {
      if (s.nextJobState == null || s.nextJobState!.trim().isEmpty) continue;
      final who = s.isCurrentVisit
          ? 'You'
          : (s.officerFullName?.trim().isNotEmpty == true
                ? s.officerFullName!.trim()
                : 'Another engineer');
      final stage = describePostReportJobState(s.nextJobState);
      final status = s.visitIsOpen ? 'visit open' : 'visit finished';
      buffer.writeln('• $who — $stage ($status)');
    }
    return buffer.toString().trim();
  }

  String _siblingChoicesBody(List<JobCompletionSibling> siblings) {
    final buffer = StringBuffer();
    for (final s in siblings) {
      final who = s.officerFullName?.trim().isNotEmpty == true
          ? s.officerFullName!.trim()
          : 'Another engineer';
      final stage = describePostReportJobState(s.nextJobState);
      final status = s.visitIsOpen ? 'visit open' : 'visit finished';
      buffer.writeln('• $who chose **$stage** ($status)');
    }
    return buffer.toString().trim();
  }

  Widget _infoCard({
    required IconData icon,
    required Color color,
    required Color background,
    required Color border,
    required String title,
    required String body,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: AppColors.slate900,
                  ),
                ),
                const SizedBox(height: 4),
                _richBody(body),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _richBody(String text) {
    final spans = <TextSpan>[];
    final parts = text.split('**');
    for (var i = 0; i < parts.length; i++) {
      final chunk = parts[i];
      if (chunk.isEmpty) continue;
      spans.add(
        TextSpan(
          text: chunk,
          style: GoogleFonts.inter(
            fontSize: 12,
            height: 1.4,
            color: AppColors.slate300,
            fontWeight: i.isOdd ? FontWeight.w700 : FontWeight.w400,
          ),
        ),
      );
    }
    return Text.rich(TextSpan(children: spans));
  }
}

/// Content for the complete-visit confirmation when multiple engineers are involved.
List<Widget> buildCompleteVisitContextContent({
  required JobCompletionContext context,
  String? myChosenJobState,
}) {
  if (!context.hasMultipleEngineers) {
    return [
      Text(
        'This marks your visit complete and closes site time on your timesheet.',
        style: GoogleFonts.inter(color: AppColors.slate300, height: 1.4),
      ),
    ];
  }

  final myStage = describePostReportJobState(
    myChosenJobState ?? 'completed',
  );
  final currentStage = describeCurrentJobState(context.currentJobState);
  final openOthers = context.otherOpenSiblings.length;

  final widgets = <Widget>[
    Text(
      'This marks your visit complete and closes site time on your timesheet.',
      style: GoogleFonts.inter(color: AppColors.slate300, height: 1.4),
    ),
    const SizedBox(height: 12),
    JobCompletionContextPanel(
      context: context,
      selectedNextJobState: myChosenJobState ?? 'completed',
      compact: true,
    ),
  ];

  if (context.isLastEngineerToComplete) {
    widgets.add(const SizedBox(height: 10));
    widgets.add(
      Text(
        'Current job stage: $currentStage. '
        'Confirming will move the job to $myStage.',
        style: GoogleFonts.inter(
          fontSize: 13,
          color: AppColors.slate300,
          height: 1.4,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  } else if (openOthers > 0) {
    widgets.add(const SizedBox(height: 10));
    widgets.add(
      Text(
        'Current job stage: $currentStage. '
        'The job will not move to $myStage yet — '
        '$openOthers other engineer${openOthers == 1 ? '' : 's'} still need${openOthers == 1 ? 's' : ''} to complete their visit.',
        style: GoogleFonts.inter(
          fontSize: 13,
          color: AppColors.slate300,
          height: 1.4,
        ),
      ),
    );
  }

  return widgets;
}

String? currentVisitNextJobState(JobCompletionContext context) {
  for (final s in context.siblings) {
    if (s.isCurrentVisit) return s.nextJobState;
  }
  return null;
}

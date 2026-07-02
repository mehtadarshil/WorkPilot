import 'package:flutter/material.dart';

import '../certificate_document_utils.dart';
import '../certificate_editor_controller.dart';
import '../constants/certificate_schedule_items.dart';
import '../widgets/cert_form_widgets.dart';
import 'custom_section_editors.dart';
import 'boards_list_editor.dart';
import 'circuit_helpers.dart';

class JsonFieldSpec {
  const JsonFieldSpec({
    required this.path,
    required this.label,
    this.maxLines = 1,
    this.options,
  });

  final String path;
  final String label;
  final int maxLines;
  final List<CertOption>? options;
}

class JsonListSpec {
  const JsonListSpec({
    required this.path,
    required this.title,
    required this.itemTitle,
    required this.fields,
    required this.newItem,
  });

  final String path;
  final String title;
  final String itemTitle;
  final List<JsonFieldSpec> fields;
  final Map<String, dynamic> Function(int index) newItem;
}

class CertificateSectionSpec {
  const CertificateSectionSpec({
    required this.key,
    required this.label,
    this.fields = const [],
    this.schedulePath,
    this.scheduleItems = const [],
    this.scheduleOptions = inspectionOutcomeOptions,
    this.listSpec,
  });

  final String key;
  final String label;
  final List<JsonFieldSpec> fields;
  final String? schedulePath;
  final List<CertificateScheduleItem> scheduleItems;
  final List<CertOption> scheduleOptions;
  final JsonListSpec? listSpec;
}

class GenericCertificateEditor extends StatelessWidget {
  const GenericCertificateEditor({
    required this.controller,
    required this.sections,
    super.key,
  });

  final CertificateEditorController controller;
  final List<CertificateSectionSpec> sections;

  @override
  Widget build(BuildContext context) {
    final activeKey = controller.activeSectionKey.value.isEmpty
        ? sections.first.key
        : controller.activeSectionKey.value;

    if (activeKey == 'observations') {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
        child: ObservationsSectionEditor(controller: controller),
      );
    }
    if (activeKey == 'appendix') {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
        child: AppendixSectionEditor(controller: controller),
      );
    }
    if (activeKey == 'signatories') {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
        child: SignatoriesSectionEditor(controller: controller),
      );
    }
    if (activeKey == 'boards' || activeKey == 'circuits') {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
        child: BoardsListEditor(controller: controller),
      );
    }

    final active = sections.firstWhere(
      (section) => section.key == activeKey,
      orElse: () => sections.first,
    );
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
      children: [
        CertSectionCard(
          title: active.label,
          children: active.fields.map((field) => _field(field)).toList(),
        ),
        if (active.schedulePath != null) ...[
          const SizedBox(height: 16),
          ScheduleItemsCard(
            title: '${active.label} checklist',
            items: active.scheduleItems,
            options: active.scheduleOptions,
            valueFor: (id) => controller.valueAt('${active.schedulePath}.$id'),
            onChanged: (id, value) =>
                controller.updatePath('${active.schedulePath}.$id', value),
          ),
        ],
        if (active.listSpec != null) ...[
          const SizedBox(height: 16),
          _JsonListEditor(controller: controller, spec: active.listSpec!),
        ],
      ],
    );
  }

  Widget _field(JsonFieldSpec field) {
    final options = field.options;
    if (options != null) {
      return CertSelectField(
        label: field.label,
        value: controller.valueAt(field.path),
        options: options,
        onChanged: (value) => controller.updatePath(field.path, value),
      );
    }
    if (field.path == 'installation.reinspectionPeriod') {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CertTextField(
            label: field.label,
            value: controller.valueAt(field.path),
            maxLines: field.maxLines,
            onChanged: (value) => controller.updatePath(field.path, value),
          ),
          _ReinspectionQuickPicks(
            onPick: (value) => controller.updatePath(field.path, value),
          ),
        ],
      );
    }
    return CertTextField(
      label: field.label,
      value: controller.valueAt(field.path),
      maxLines: field.maxLines,
      onChanged: (value) => controller.updatePath(field.path, value),
    );
  }
}

class _ReinspectionQuickPicks extends StatelessWidget {
  const _ReinspectionQuickPicks({required this.onPick});

  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: reinspectionQuickOptions
            .map(
              (option) => ActionChip(
                label: Text(option, style: TextStyle(fontSize: 11)),
                onPressed: () => onPick(option),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _JsonListEditor extends StatelessWidget {
  const _JsonListEditor({required this.controller, required this.spec});

  final CertificateEditorController controller;
  final JsonListSpec spec;

  @override
  Widget build(BuildContext context) {
    final rows = controller.listAt(spec.path);
    return CertSectionCard(
      title: spec.title,
      children: [
        ...rows.asMap().entries.map((entry) {
          final index = entry.key;
          final row = entry.value;
          final titleValue =
              row['reference'] ??
              row['applianceId'] ??
              row['description'] ??
              row['location'];
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: CertSectionCard(
              title: '${spec.itemTitle} ${index + 1}',
              subtitle: titleValue?.toString(),
              children: [
                ...spec.fields.map((field) {
                  final path = '${spec.path}.$index.${field.path}';
                  final options = field.options;
                  if (options != null) {
                    return CertSelectField(
                      label: field.label,
                      value: controller.valueAt(path),
                      options: options,
                      onChanged: (value) => controller.updatePath(path, value),
                    );
                  }
                  return CertTextField(
                    label: field.label,
                    value: controller.valueAt(path),
                    maxLines: field.maxLines,
                    onChanged: (value) => controller.updatePath(path, value),
                  );
                }),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: () => _remove(index),
                    icon: Icon(Icons.delete_outline_rounded),
                    label: const Text('Remove'),
                  ),
                ),
              ],
            ),
          );
        }),
        OutlinedButton.icon(
          onPressed: () => _add(rows),
          icon: Icon(Icons.add_rounded),
          label: Text('Add ${spec.itemTitle.toLowerCase()}'),
        ),
      ],
    );
  }

  void _add(List<Map<String, dynamic>> rows) {
    final nextRows = rows.map((row) => Map<String, dynamic>.from(row)).toList();
    nextRows.add(spec.newItem(nextRows.length));
    controller.updatePath(spec.path, nextRows);
  }

  void _remove(int index) {
    final rows = controller.listAt(spec.path);
    if (index < 0 || index >= rows.length) return;
    rows.removeAt(index);
    controller.updatePath(spec.path, rows);
  }
}

JsonListSpec applianceListSpec(String path) {
  return JsonListSpec(
    path: path,
    title: 'Appliances',
    itemTitle: 'Appliance',
    fields: const [
      JsonFieldSpec(path: 'applianceId', label: 'Appliance ID'),
      JsonFieldSpec(path: 'description', label: 'Description'),
      JsonFieldSpec(path: 'brand', label: 'Brand'),
      JsonFieldSpec(path: 'location', label: 'Location'),
      JsonFieldSpec(path: 'serialNo', label: 'Serial no.'),
      JsonFieldSpec(path: 'retestPeriod', label: 'Retest period'),
      JsonFieldSpec(
        path: 'status',
        label: 'Status',
        options: passFailNaOptions,
      ),
    ],
    newItem: (index) => {
      'id': newId('pat'),
      'applianceId': (index + 1).toString().padLeft(3, '0'),
      'brand': '',
      'description': '',
      'location': '',
      'serialNo': '',
      'retestPeriod': '12 Months',
      'status': 'pass',
    },
  );
}

JsonListSpec simpleAssetListSpec({
  required String path,
  required String title,
  required String itemTitle,
  bool includeOutcome = true,
}) {
  return JsonListSpec(
    path: path,
    title: title,
    itemTitle: itemTitle,
    fields: [
      const JsonFieldSpec(path: 'reference', label: 'Reference'),
      const JsonFieldSpec(path: 'location', label: 'Location'),
      if (includeOutcome)
        const JsonFieldSpec(
          path: 'result',
          label: 'Result',
          options: passFailNaOptions,
        ),
      const JsonFieldSpec(path: 'notes', label: 'Notes', maxLines: 3),
    ],
    newItem: (index) => {
      'id': newId(itemTitle.toLowerCase().replaceAll(' ', '_')),
      'reference':
          '${itemTitle.substring(0, 1).toUpperCase()}-${(index + 1).toString().padLeft(2, '0')}',
      'location': '',
      'result': '',
      'notes': '',
      'photos': <dynamic>[],
    },
  );
}

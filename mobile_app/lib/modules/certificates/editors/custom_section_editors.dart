import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import '../../../core/values/app_colors.dart';
import '../certificate_document_utils.dart';
import '../certificate_editor_controller.dart';
import 'circuit_helpers.dart';
import '../widgets/cert_form_widgets.dart';

class ObservationsSectionEditor extends StatelessWidget {
  const ObservationsSectionEditor({required this.controller, super.key});

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final obs = controller.document['observations'] as Map<String, dynamic>? ?? {};
      final noRemedial = obs['noRemedialRequired'] == true;
      final List<dynamic> rawItems = obs['items'] as List<dynamic>? ?? [];
      final items = rawItems.cast<Map<String, dynamic>>();

      return ListView(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          CertSectionCard(
            title: 'Observations',
            children: [
              CheckboxListTile(
                title: Text(
                  'No remedial action required',
                  style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                ),
                value: noRemedial,
                activeColor: AppColors.primary,
                checkColor: Colors.white,
                onChanged: (val) {
                  final nextObs = Map<String, dynamic>.from(obs);
                  nextObs['noRemedialRequired'] = val == true;
                  controller.updatePath('observations', nextObs);
                },
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
              ),
              const SizedBox(height: 12),
              ElevatedButton.icon(
                onPressed: () {
                  final nextObs = Map<String, dynamic>.from(obs);
                  final nextItems = List<Map<String, dynamic>>.from(items);
                  nextItems.add({
                    'id': newId('obs'),
                    'code': 'c2',
                    'location': '',
                    'details': '',
                  });
                  nextObs['items'] = nextItems;
                  controller.updatePath('observations', nextObs);
                },
                icon: Icon(Icons.add_rounded, color: AppColors.slate900),
                label: Text(
                  'Add observation',
                  style: GoogleFonts.inter(fontWeight: FontWeight.bold),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 8),
              if (items.length > 1)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () {
                      final nextObs = Map<String, dynamic>.from(obs);
                      nextObs['items'] = sortObservationsByCodeAndLocation(items);
                      controller.updatePath('observations', nextObs);
                    },
                    icon: Icon(Icons.sort_rounded, color: AppColors.primary, size: 18),
                    label: Text(
                      'Sort by code & location',
                      style: GoogleFonts.inter(color: AppColors.primary, fontSize: 12),
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              if (items.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  child: Text(
                    'No observations recorded.',
                    style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 13),
                    textAlign: TextAlign.center,
                  ),
                )
              else
                ...items.asMap().entries.map((entry) {
                  final idx = entry.key;
                  final item = entry.value;
                  final itemCode = item['code']?.toString() ?? 'c2';
                  final itemLoc = item['location']?.toString() ?? '';
                  final itemDetails = item['details']?.toString() ?? '';

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        color: AppColors.whiteOverlay(0.04),
                        border: Border.all(color: AppColors.slate200),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: CertSelectField(
                                  label: 'Code',
                                  value: itemCode,
                                  options: const [
                                    CertOption('c1', 'C1'),
                                    CertOption('c2', 'C2'),
                                    CertOption('c3', 'C3'),
                                    CertOption('fi', 'FI'),
                                  ],
                                  onChanged: (val) {
                                    _updateItem(idx, 'code', val, obs, items);
                                  },
                                ),
                              ),
                              IconButton(
                                icon: Icon(Icons.delete_outline_rounded, color: Color(0xFFE11D48)),
                                onPressed: () {
                                  _removeItem(idx, obs, items);
                                },
                              ),
                            ],
                          ),
                          CertTextField(
                            label: 'Location',
                            value: itemLoc,
                            onChanged: (val) {
                              _updateItem(idx, 'location', val, obs, items);
                            },
                          ),
                          CertTextField(
                            label: 'Details',
                            value: itemDetails,
                            maxLines: 4,
                            onChanged: (val) {
                              _updateItem(idx, 'details', val, obs, items);
                            },
                          ),
                        ],
                      ),
                    ),
                  );
                }),
            ],
          ),
        ],
      );
    });
  }

  void _updateItem(int idx, String key, dynamic value, Map<String, dynamic> obs, List<Map<String, dynamic>> items) {
    final nextObs = Map<String, dynamic>.from(obs);
    final nextItems = items.map((i) => Map<String, dynamic>.from(i)).toList();
    if (idx >= 0 && idx < nextItems.length) {
      nextItems[idx][key] = value;
      nextObs['items'] = nextItems;
      controller.updatePath('observations', nextObs);
    }
  }

  void _removeItem(int idx, Map<String, dynamic> obs, List<Map<String, dynamic>> items) {
    final nextObs = Map<String, dynamic>.from(obs);
    final nextItems = List<Map<String, dynamic>>.from(items);
    if (idx >= 0 && idx < nextItems.length) {
      nextItems.removeAt(idx);
      nextObs['items'] = nextItems;
      controller.updatePath('observations', nextObs);
    }
  }
}

class AppendixSectionEditor extends StatelessWidget {
  const AppendixSectionEditor({required this.controller, super.key});

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final appendix = controller.document['appendix'] as Map<String, dynamic>? ?? {};
      final content = appendix['content']?.toString() ?? '';
      final List<dynamic> rawPhotos = appendix['photos'] as List<dynamic>? ?? [];
      final photos = rawPhotos.cast<Map<String, dynamic>>();

      return ListView(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          CertSectionCard(
            title: 'Appendix notes & photos',
            children: [
              CertTextField(
                label: 'Additional information',
                value: content,
                maxLines: 6,
                onChanged: (val) {
                  final nextApp = Map<String, dynamic>.from(appendix);
                  nextApp['content'] = val;
                  controller.updatePath('appendix', nextApp);
                },
              ),
            ],
          ),
          const SizedBox(height: 16),
          CertSectionCard(
            title: 'Appendix photographs',
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Photographs',
                    style: GoogleFonts.inter(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
                  ),
                  Row(
                    children: [
                      TextButton.icon(
                        onPressed: () => _pickImage(ImageSource.gallery, appendix, photos),
                        icon: Icon(Icons.photo_library_outlined, color: AppColors.primary, size: 18),
                        label: Text('Gallery', style: GoogleFonts.inter(color: AppColors.primary)),
                      ),
                      TextButton.icon(
                        onPressed: () => _pickImage(ImageSource.camera, appendix, photos),
                        icon: Icon(Icons.photo_camera_outlined, color: AppColors.primary, size: 18),
                        label: Text('Camera', style: GoogleFonts.inter(color: AppColors.primary)),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (photos.isEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.slate200),
                  ),
                  child: Center(
                    child: Text(
                      'No photos yet',
                      style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13),
                    ),
                  ),
                )
              else
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                    childAspectRatio: 0.8,
                  ),
                  itemCount: photos.length,
                  itemBuilder: (context, idx) {
                    final photo = photos[idx];
                    final String dataUrl = photo['dataUrl']?.toString() ?? '';
                    final String caption = photo['caption']?.toString() ?? '';
                    final String id = photo['id']?.toString() ?? '';

                    ImageProvider imageProvider;
                    if (dataUrl.startsWith('data:image/')) {
                      final base64Part = dataUrl.split(',').last;
                      imageProvider = MemoryImage(base64Decode(base64Part));
                    } else {
                      imageProvider = NetworkImage(dataUrl);
                    }

                    return Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        color: AppColors.whiteOverlay(0.04),
                        border: Border.all(color: AppColors.slate200),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(
                            child: ClipRRect(
                              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                              child: Stack(
                                children: [
                                  Positioned.fill(
                                    child: Image(
                                      image: imageProvider,
                                      fit: BoxFit.cover,
                                      errorBuilder: (context, err, stack) => const Center(
                                        child: Icon(Icons.broken_image_outlined, color: Color(0xFFE11D48)),
                                      ),
                                    ),
                                  ),
                                  Positioned(
                                    top: 4,
                                    right: 4,
                                    child: CircleAvatar(
                                      backgroundColor: Colors.black54,
                                      radius: 16,
                                      child: IconButton(
                                        icon: Icon(Icons.delete_outline_rounded, size: 16, color: Color(0xFFE11D48)),
                                        padding: EdgeInsets.zero,
                                        onPressed: () {
                                          _removePhoto(idx, appendix, photos);
                                        },
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.all(6),
                            child: TextFormField(
                              key: ValueKey(id),
                              initialValue: caption,
                              style: GoogleFonts.inter(color: Colors.white, fontSize: 12),
                              decoration: InputDecoration(
                                hintText: 'Caption',
                                hintStyle: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12),
                                contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                isDense: true,
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(6),
                                  borderSide: const BorderSide(color: AppColors.slate200),
                                ),
                              ),
                              onChanged: (val) {
                                _updatePhotoCaption(idx, val, appendix, photos);
                              },
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
            ],
          ),
        ],
      );
    });
  }

  Future<void> _pickImage(ImageSource source, Map<String, dynamic> appendix, List<Map<String, dynamic>> photos) async {
    final picker = ImagePicker();
    final f = await picker.pickImage(
      source: source,
      maxWidth: 1400,
      imageQuality: 82,
    );
    if (f == null) return;
    try {
      final bytes = await FlutterImageCompress.compressWithFile(
        f.path,
        minWidth: 1400,
        minHeight: 1400,
        quality: 80,
        format: CompressFormat.jpeg,
      );
      if (bytes == null) return;
      final base64Str = base64Encode(bytes);
      final dataUrl = 'data:image/jpeg;base64,$base64Str';
      final fileName = f.name.replaceAll(RegExp(r'\.[^.]+$'), '');

      final nextApp = Map<String, dynamic>.from(appendix);
      final nextPhotos = List<Map<String, dynamic>>.from(photos);
      nextPhotos.add({
        'id': newId('ph'),
        'caption': fileName,
        'dataUrl': dataUrl,
      });
      nextApp['photos'] = nextPhotos;
      controller.updatePath('appendix', nextApp);
    } catch (e) {
      Get.snackbar('Image Error', 'Failed to read image file: $e');
    }
  }

  void _removePhoto(int idx, Map<String, dynamic> appendix, List<Map<String, dynamic>> photos) {
    final nextApp = Map<String, dynamic>.from(appendix);
    final nextPhotos = List<Map<String, dynamic>>.from(photos);
    if (idx >= 0 && idx < nextPhotos.length) {
      nextPhotos.removeAt(idx);
      nextApp['photos'] = nextPhotos;
      controller.updatePath('appendix', nextApp);
    }
  }

  void _updatePhotoCaption(int idx, String val, Map<String, dynamic> appendix, List<Map<String, dynamic>> photos) {
    final nextApp = Map<String, dynamic>.from(appendix);
    final nextPhotos = photos.map((p) => Map<String, dynamic>.from(p)).toList();
    if (idx >= 0 && idx < nextPhotos.length) {
      nextPhotos[idx]['caption'] = val;
      nextApp['photos'] = nextPhotos;
      controller.updatePath('appendix', nextApp);
    }
  }
}

class SignatoriesSectionEditor extends StatelessWidget {
  const SignatoriesSectionEditor({required this.controller, super.key});

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final designer2NotApplicable = getDocumentPath(controller.document, 'electricalInstallation.design.designer2NotApplicable') == true;

      return ListView(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          _SignatoryContactCard(
            title: 'Designer No. 1 company details',
            pathPrefix: 'electricalInstallation.design.designer1',
            controller: controller,
          ),
          const SizedBox(height: 16),
          if (designer2NotApplicable)
            CertSectionCard(
              title: 'Designer No. 2 company details',
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'Designer No. 2 is marked N/A.',
                    style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 13),
                  ),
                ),
              ],
            )
          else ...[
            _SignatoryContactCard(
              title: 'Designer No. 2 company details',
              pathPrefix: 'electricalInstallation.design.designer2',
              controller: controller,
            ),
            const SizedBox(height: 16),
          ],
          _SignatoryContactCard(
            title: 'Constructor company details',
            pathPrefix: 'electricalInstallation.construction.constructorSignatory',
            controller: controller,
          ),
          const SizedBox(height: 16),
          _SignatoryContactCard(
            title: 'Inspector company details',
            pathPrefix: 'electricalInstallation.inspection.inspector',
            controller: controller,
          ),
        ],
      );
    });
  }
}

class _SignatoryContactCard extends StatelessWidget {
  const _SignatoryContactCard({
    required this.title,
    required this.pathPrefix,
    required this.controller,
  });

  final String title;
  final String pathPrefix;
  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    final company = controller.valueAt('$pathPrefix.company');
    final phone = controller.valueAt('$pathPrefix.phone');
    final address = controller.valueAt('$pathPrefix.address');
    final postcode = controller.valueAt('$pathPrefix.postcode');

    return CertSectionCard(
      title: title,
      children: [
        CertTextField(
          label: 'Company',
          value: company,
          onChanged: (val) => controller.updatePath('$pathPrefix.company', val),
        ),
        CertTextField(
          label: 'Phone',
          value: phone,
          onChanged: (val) => controller.updatePath('$pathPrefix.phone', val),
        ),
        CertTextField(
          label: 'Address',
          value: address,
          maxLines: 3,
          onChanged: (val) => controller.updatePath('$pathPrefix.address', val),
        ),
        CertTextField(
          label: 'Postcode',
          value: postcode,
          onChanged: (val) => controller.updatePath('$pathPrefix.postcode', val),
        ),
      ],
    );
  }
}

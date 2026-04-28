/// Row from `customer_specific_notes` (customer detail or work address detail).
class CustomerSpecificNote {
  CustomerSpecificNote({
    required this.id,
    required this.title,
    required this.description,
    this.workAddressId,
  });

  factory CustomerSpecificNote.fromJson(Map<String, dynamic> m) {
    final idRaw = m['id'];
    final id = idRaw is int
        ? idRaw
        : idRaw is num
            ? idRaw.toInt()
            : int.tryParse(idRaw?.toString() ?? '') ?? 0;
    final titleRaw = m['title'];
    final descRaw = m['description'];
    final waRaw = m['work_address_id'];
    return CustomerSpecificNote(
      id: id,
      title: (titleRaw is String ? titleRaw : titleRaw?.toString())?.trim() ?? '',
      description: (descRaw is String ? descRaw : descRaw?.toString())?.trim() ?? '',
      workAddressId: waRaw == null
          ? null
          : waRaw is int
              ? waRaw
              : waRaw is num
                  ? waRaw.toInt()
                  : int.tryParse(waRaw.toString()),
    );
  }

  final int id;
  final String title;
  final String description;
  final int? workAddressId;
}

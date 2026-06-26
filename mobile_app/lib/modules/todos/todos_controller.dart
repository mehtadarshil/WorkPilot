import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/repositories/mobile_repository.dart';

class Todo {
  final int id;
  final int userId;
  final String? userName;
  final String title;
  final String? description;
  final String? dueDate;
  final String? dueTime;
  final bool completed;
  final String? completedAt;
  final String? createdAt;

  Todo({
    required this.id,
    required this.userId,
    this.userName,
    required this.title,
    this.description,
    this.dueDate,
    this.dueTime,
    required this.completed,
    this.completedAt,
    this.createdAt,
  });

  factory Todo.fromJson(Map<String, dynamic> json) {
    return Todo(
      id: (json['id'] as num).toInt(),
      userId: (json['user_id'] as num).toInt(),
      userName: json['user_name'] as String?,
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      dueDate: json['due_date'] as String?,
      dueTime: json['due_time'] as String?,
      completed: json['completed'] as bool? ?? false,
      completedAt: json['completed_at'] as String?,
      createdAt: json['created_at'] as String?,
    );
  }

  bool get isOverdue {
    if (completed || dueDate == null) return false;
    final due = DateTime.parse('$dueDate${dueTime != null ? 'T$dueTime' : 'T23:59:59'}');
    return due.isBefore(DateTime.now());
  }

  String get dueLabel {
    final parts = <String>[];
    if (dueDate != null) parts.add(dueDate!);
    if (dueTime != null && dueTime!.length >= 5) parts.add(dueTime!.substring(0, 5));
    return parts.join(' ');
  }
}

class TodosController extends GetxController {
  TodosController({MobileRepository? mobile})
      : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  final RxList<Todo> todos = <Todo>[].obs;
  final RxBool loading = false.obs;
  final RxString error = ''.obs;
  final RxInt filterIndex = 0.obs; // 0 = pending, 1 = done, 2 = all

  @override
  void onInit() {
    super.onInit();
    fetchTodos();
  }

  List<Todo> get filteredTodos {
    switch (filterIndex.value) {
      case 0:
        return todos.where((t) => !t.completed).toList();
      case 1:
        return todos.where((t) => t.completed).toList();
      default:
        return todos.toList();
    }
  }

  Future<void> fetchTodos() async {
    loading.value = true;
    error.value = '';
    try {
      String queryParam = '';
      if (filterIndex.value == 0) queryParam = '?completed=false';
      else if (filterIndex.value == 1) queryParam = '?completed=true';

      final res = await _mobile.api.get<Map<String, dynamic>>('/todos$queryParam');
      final data = res.data ?? {};
      final list = (data['todos'] as List<dynamic>?) ?? [];
      todos.value = list
          .map((e) => Todo.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = 'Could not load todos';
    } finally {
      loading.value = false;
    }
  }

  Future<void> addTodo({
    required String title,
    String? description,
    String? dueDate,
    String? dueTime,
  }) async {
    error.value = '';
    try {
      final payload = <String, dynamic>{
        'title': title,
      };
      if (description != null && description.isNotEmpty) payload['description'] = description;
      if (dueDate != null && dueDate.isNotEmpty) payload['due_date'] = dueDate;
      if (dueTime != null && dueTime.isNotEmpty) payload['due_time'] = dueTime;

      await _mobile.api.post<Map<String, dynamic>>('/todos', data: payload);
      await fetchTodos();
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = 'Could not add todo';
    }
  }

  Future<void> toggleComplete(Todo todo) async {
    try {
      await _mobile.api.patch<Map<String, dynamic>>(
        '/todos/${todo.id}',
        data: {'completed': !todo.completed},
      );
      await fetchTodos();
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = 'Could not update todo';
    }
  }

  Future<void> deleteTodo(int id) async {
    try {
      await _mobile.api.delete<Map<String, dynamic>>('/todos/$id');
      await fetchTodos();
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = 'Could not delete todo';
    }
  }
}

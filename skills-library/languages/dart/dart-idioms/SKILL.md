---
name: dart-idioms
description: Applies software design idiomatically in Dart and Flutter — immutable models with final/const and copyWith, sealed classes with pattern matching, mixins, extension methods, null safety, async and streams, Effective Dart naming. Use when writing Dart or Flutter code, or asked "how do I model this in Dart", "sealed class", "mixin or inheritance", or "OOP in Dart".
---

# Dart idioms

How the principles in `design-principles` translate into Dart. Follow Effective Dart and the project's
`analysis_options.yaml`; don't fight the linter.

## Rules, in priority order

1. **Models are immutable.** All fields `final`, `const` constructors where possible, `copyWith` for
   updates, value equality (`==`/`hashCode`, or `freezed`/`equatable` if the project uses them).
2. **Variants are `sealed` classes + `switch` pattern matching**, not `is` chains or nullable flag fields.
   The compiler enforces exhaustiveness on sealed hierarchies.
3. **Dependencies come through the constructor**, typed by abstract interface classes. Wire them at the app
   root (provider/riverpod/get_it or plain constructors in `main`) — the composition root. No widget or
   service reaches for a global singleton that does I/O.
4. **Composition over inheritance.** Widgets compose widgets. Use `mixin` for small, stateless
   capabilities shared across unrelated classes; `extends` only for framework base classes
   (`StatelessWidget`, `State<T>`, `Exception`).
5. **Extension methods** add helpers to types you don't own (`DateTime`, `String`, `BuildContext`); keep
   them pure and small, and don't hide I/O in them.
6. **Null safety is a design tool.** Make fields non-nullable unless absence is meaningful; avoid `!` —
   prefer `?.`, `??`, early returns, or `if (x case final value?)`. `late` only when initialisation is
   guaranteed (e.g. `initState`).
7. **Business logic lives outside widgets.** Widgets render; a controller/notifier/bloc owns state; a
   repository does I/O; pure functions decide.
8. **Effective Dart naming:** `UpperCamelCase` types and extensions, `lowerCamelCase` members and
   constants, `snake_case` file and library names; private with a leading `_`; no `I` prefix on interfaces.

## Examples

```dart
// Immutable model with copyWith
class User {
  const User({required this.id, required this.name, this.email});
  final String id;
  final String name;
  final String? email;

  User copyWith({String? name, String? email}) =>
      User(id: id, name: name ?? this.name, email: email ?? this.email);
}
```

```dart
// Sealed state + exhaustive pattern matching (Dart 3)
sealed class LoadState<T> {}
final class Loading<T> extends LoadState<T> {}
final class Loaded<T> extends LoadState<T> { Loaded(this.value); final T value; }
final class Failed<T> extends LoadState<T> { Failed(this.error); final Object error; }

Widget build(BuildContext context) => switch (state) {
      Loading() => const CircularProgressIndicator(),
      Loaded(:final value) => UserTile(user: value),
      Failed(:final error) => ErrorView(message: '$error'),
    };
```

```dart
// Interface + injected dependency
abstract interface class UserRepository {
  Future<User?> getById(String id);
}

class ProfileController {
  ProfileController(this._users);
  final UserRepository _users;
  Future<User?> load(String id) => _users.getById(id);
}
```

## Async and streams

- `async`/`await` over raw `.then` chains. Always `await` or deliberately `unawaited(...)` a `Future`.
- Use `Stream` for values over time (auth state, live queries); expose `Stream`, keep `StreamController`
  private, and `close()` it in `dispose`.
- Cancel `StreamSubscription`s and dispose controllers in `State.dispose`; check `mounted` before using
  `context` or `setState` after an `await`.
- Catch specific exceptions (`on SocketException catch (e)`), rethrow with context; never an empty `catch`.

## Smaller idioms

- Records for lightweight multi-value returns: `(int, String) parse(...)`, or named `({int count, String label})`.
- Collection `if`/`for` and spreads in literals instead of imperative list building.
- `final` for locals that aren't reassigned; `const` widgets to cut rebuilds.
- `enum` with fields and methods (enhanced enums) for fixed sets with behaviour.
- Factory constructors (`factory User.fromJson(Map<String, dynamic> json)`) validate external data at the
  boundary; never pass `dynamic` maps inward.

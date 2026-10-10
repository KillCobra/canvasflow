import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle } from '@expo/ui/swift-ui/modifiers';

/** The system date and time picker, shown inline (graphical calendar plus time). */
export function PostTimePicker({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  return (
    <Host matchContents colorScheme="dark">
      <DatePicker
        selection={value}
        range={{ start: new Date() }}
        displayedComponents={['date', 'hourAndMinute']}
        onDateChange={onChange}
        modifiers={[datePickerStyle('graphical')]}
      />
    </Host>
  );
}

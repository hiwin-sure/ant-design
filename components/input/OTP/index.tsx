import * as React from 'react';
import classNames from 'classnames';
import { useEvent } from 'rc-util';
import pickAttrs from 'rc-util/lib/pickAttrs';

import { getMergedStatus } from '../../_util/statusUtils';
import type { InputStatus } from '../../_util/statusUtils';
import { devUseWarning } from '../../_util/warning';
import { ConfigContext } from '../../config-provider';
import useCSSVarCls from '../../config-provider/hooks/useCSSVarCls';
import useSize from '../../config-provider/hooks/useSize';
import type { SizeType } from '../../config-provider/SizeContext';
import { FormItemInputContext } from '../../form/context';
import type { FormItemStatusContextProps } from '../../form/context';
import type { Variant } from '../../form/hooks/useVariants';
import type { InputRef } from '../Input';
import useStyle from '../style/otp';
import OTPInput from './OTPInput';
import type { OTPInputProps } from './OTPInput';
import useSingleValue from './useSingleValue';

const isEmoji = (str: string) => {
  const emojiReg =
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|\uD83D[\uDC00-\uDE4F]|\uD83C[\uDC00-\uDFFF]|\uD83E[\uDD10-\uDDFF]/gu;
  return emojiReg.test(str);
};

export interface OTPRef {
  focus: VoidFunction;
  blur: VoidFunction;
  nativeElement: HTMLDivElement;
}

export interface OTPProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  prefixCls?: string;
  length?: number;

  // Style
  variant?: Variant;
  rootClassName?: string;
  className?: string;
  style?: React.CSSProperties;
  size?: SizeType;

  // Values
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  formatter?: (value: string) => string;

  // Status
  disabled?: boolean;
  status?: InputStatus;

  /**
   * @descCN 如果希望在 Input.OTP 输入框展示密文，可以设置 `mask` 为 `true`，或者设置为自定义的字符。
   * @descEN If you want to display the ciphertext in the Input.OTP, you can set `mask` to `true`, or set a custom character.
   * @default false
   * @since 5.17.0
   */
  mask?: boolean | string;
}

function strToArr(str: string) {
  return str.split('');
}

const OTP = React.forwardRef<OTPRef, OTPProps>((props, ref) => {
  const {
    prefixCls: customizePrefixCls,
    length = 6,
    size: customSize,
    defaultValue,
    value,
    onChange,
    formatter,
    variant,
    disabled,
    status: customStatus,
    autoFocus,
    mask,
    ...restProps
  } = props;

  if (process.env.NODE_ENV !== 'production') {
    const warning = devUseWarning('Input.OTP');
    warning(
      !(typeof mask === 'string' && !isEmoji(mask) && mask.length > 1),
      'usage',
      '`mask` prop should be a single character.',
    );
  }

  const { getPrefixCls, direction } = React.useContext(ConfigContext);
  const prefixCls = getPrefixCls('otp', customizePrefixCls);

  const domAttrs = pickAttrs(restProps, {
    aria: true,
    data: true,
    attr: true,
  });

  // ========================= Root =========================
  // Style
  const rootCls = useCSSVarCls(prefixCls);
  const [wrapCSSVar, hashId, cssVarCls] = useStyle(prefixCls, rootCls);

  // ========================= Size =========================
  const mergedSize = useSize((ctx) => customSize ?? ctx);

  // ======================== Status ========================
  const formContext = React.useContext(FormItemInputContext);
  const mergedStatus = getMergedStatus(formContext.status, customStatus);

  const proxyFormContext = React.useMemo<FormItemStatusContextProps>(
    () => ({
      ...formContext,
      status: mergedStatus,
      hasFeedback: false,
      feedbackIcon: null,
    }),
    [formContext, mergedStatus],
  );

  // ========================= Refs =========================
  const containerRef = React.useRef<HTMLDivElement>(null);

  const inputRefs = React.useRef<Record<number, InputRef | null>>({});

  React.useImperativeHandle(ref, () => ({
    focus: () => {
      inputRefs.current[0]?.focus();
    },
    blur: () => {
      for (let i = 0; i < length; i += 1) {
        inputRefs.current[i]?.blur();
      }
    },
    nativeElement: containerRef.current!,
  }));

  // ======================= Formatter ======================
  const internalFormatter = (txt: string) => (formatter ? formatter(txt) : txt);

  // ======================== Values ========================
  const [valueCells, setValueCells] = React.useState<string[]>(
    strToArr(internalFormatter(defaultValue || '')),
  );

  React.useEffect(() => {
    if (value) {
      setValueCells(strToArr(value));
    }
  }, [value]);

  const getSingleValue = useSingleValue(valueCells, mask);

  const triggerValueCellsChange = useEvent((nextValueCells: string[]) => {
    setValueCells(nextValueCells);

    // Trigger if all cells are filled
    if (
      nextValueCells.length === length &&
      nextValueCells.every((c) => c) &&
      nextValueCells.some((c, index) => valueCells[index] !== c)
    ) {
      onChange?.(nextValueCells.join(''));
    }
  });

  const patchValue = useEvent((index: number, txt: string) => {
    let nextCells = [...valueCells];

    // Fill cells till index
    for (let i = 0; i < index; i += 1) {
      if (!nextCells[i]) {
        nextCells[i] = '';
      }
    }

    if (txt.length <= 1) {
      nextCells[index] = txt;
    } else {
      nextCells = nextCells.slice(0, index).concat(strToArr(txt));
    }
    nextCells = nextCells.slice(0, length);

    // Clean the last empty cell
    for (let i = nextCells.length - 1; i >= 0; i -= 1) {
      if (nextCells[i]) {
        break;
      }
      nextCells.pop();
    }

    // Format if needed
    const formattedValue = internalFormatter(nextCells.map((c) => c || ' ').join(''));
    nextCells = strToArr(formattedValue).map((c, i) => {
      if (c === ' ' && !nextCells[i]) {
        return nextCells[i];
      }
      return c;
    });

    return nextCells;
  });

  // ======================== Change ========================
  const onInputChange: OTPInputProps['onChange'] = (index, txt) => {
    const nextCells = patchValue(index, txt);

    const nextIndex = Math.min(index + txt.length, length - 1);
    if (nextIndex !== index) {
      inputRefs.current[nextIndex]?.focus();
    }

    triggerValueCellsChange(nextCells);
  };

  const onInputActiveChange: OTPInputProps['onActiveChange'] = (nextIndex) => {
    inputRefs.current[nextIndex]?.focus();
  };

  // ======================== Render ========================
  const inputSharedProps: Partial<OTPInputProps> = {
    variant,
    disabled,
    status: mergedStatus as InputStatus,
    mask,
  };

  return wrapCSSVar(
    <div
      {...domAttrs}
      ref={containerRef}
      className={classNames(
        prefixCls,
        {
          [`${prefixCls}-sm`]: mergedSize === 'small',
          [`${prefixCls}-lg`]: mergedSize === 'large',
          [`${prefixCls}-rtl`]: direction === 'rtl',
        },
        cssVarCls,
        hashId,
      )}
    >
      <FormItemInputContext.Provider value={proxyFormContext}>
        {Array.from({ length }).map((_, index) => {
          const key = `otp-${index}`;
          const singleValue = getSingleValue(index);
          return (
            <OTPInput
              ref={(inputEle) => {
                inputRefs.current[index] = inputEle;
              }}
              key={key}
              index={index}
              size={mergedSize}
              htmlSize={1}
              className={`${prefixCls}-input`}
              onChange={onInputChange}
              value={singleValue}
              onActiveChange={onInputActiveChange}
              autoFocus={index === 0 && autoFocus}
              {...inputSharedProps}
            />
          );
        })}
      </FormItemInputContext.Provider>
    </div>,
  );
});

export default OTP;
